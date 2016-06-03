'use strict';

var fs = require('fs');
var path = require('path');
var debug = require('debug')('base:verb:verb-readme-generator');
var helpers = require('./lib/helpers');
var utils = require('./lib/utils');
var lint = require('./lib/lint');

/**
 * Verb readme generator
 */

module.exports = function generator(app, base) {
  if (!utils.isValid(app)) return;
  app.engine('hbs', require('engine-handlebars'));

  var cwd = path.resolve.bind(path, app.cwd);
  var templates = path.resolve.bind(path, __dirname, 'templates');
  var config = {};

  /**
   * Helpers
   */

  helpers(app);

  /**
   * Set options
   */

  app.task('options', {silent: true}, function(cb) {
    app.option('toc.footer', '\n\n_(TOC generated by [verb](https://github.com/verbose/verb) using [markdown-toc](https://github.com/jonschlinkert/markdown-toc))_');
    app.option('engineOpts', {delims: ['{%', '%}']});
    app.option('toAlias', function readme(name) {
      if (/^verb-.*?-\w/.test(name)) {
        return name.replace(/^verb-(.*?)-(?:\w+)/, '$1');
      }
      return name.slice(name.lastIndexOf('-') + 1);
    });

    // update config object from `app.config.process()`, which processes
    // config values in package.json
    config = app.base.get('cache.config');
    cb();
  })

  /**
   * Plugins
   */

  app.task('plugins', {silent: true}, function(cb) {
    app.use(utils.conflicts());
    app.use(require('verb-defaults'));
    app.use(require('verb-collections'));
    app.use(require('verb-repo-helpers'));
    app.use(require('verb-repo-data'));
    app.use(require('verb-toc'));
    app.use(utils.questions());
    app.use(utils.loader());
    app.use(utils.pkg());
    cb();
  });

  /**
   * Middleware
   */

  app.task('middleware', { silent: true }, function(cb) {
    if (app.option('lint.reflinks')) {
      app.postRender(/\.md$/, require('./lib/reflinks')(app));
    }

    if (app.option('sections')) {
      app.onLoad(/\.md$/, require('./lib/sections')(app));
    }

    app.preRender(/(verb|readme)\.md$/i, function(file, next) {
      utils.del(path.resolve(app.cwd, 'readme.md'), next);
    });

    app.onLoad(/(verb|readme)\.md$/, lint.layout(app));
    app.on('readme-generator:end', function() {
      var warnings = app.get('cache.readmeWarnings');
      warnings.forEach(function(obj) {
        console.log(obj.filename + ' | ' + obj.message);
      });
    });

    cb();
  });

  /**
   * Loads data to used for rendering templates. Called by the [readme]() task.
   *
   * ```sh
   * $ verb readme:data
   * ```
   * @name data
   * @api public
   */

  app.task('data', { silent: true }, function(cb) {
    debug('loading data');

    // temporary data
    app.data({verb: {}});
    app.data({
      links: {
        generate: {
          'getting_started': 'https://github.com/generate/getting-started-guide'
        }
      }
    });

    if (utils.exists(cwd('bower.json'))) {
      app.data({bower: true});
    }

    if (app.isGenerator) {
      app.option('toAlias', function(name) {
        return utils.camelcase(name.replace(/^generate-/, ''));
      });
    }

    app.data({prefix: 'Copyright'});
    debug('data finished');
    cb();
  });

  /**
   * Add a `.verb.md` template to the current working directory.
   *
   * ```sh
   * $ verb readme:new
   * ```
   * @name new
   * @api public
   */

  app.task('new', function() {
    var dest = path.resolve(app.option('dest') || app.cwd);
    var file = app.file('.verb.md', readTemplate(app, 'verbmd/basic.md'));
    return app.toStream('files')
      .pipe(app.conflicts(dest))
      .pipe(app.dest(function(file) {
        file.base = dest;
        file.path = path.resolve(file.base, '.verb.md');
        return dest;
      }))
  });

  /**
   * Load the `.verb.md` in the user's current working directory. If no `.verb.md`
   * file exists, the [prompt-verbmd)() task is called to ask the user if they want to
   * add the file. Disable the prompt by passing `--verbmd=false` on the command line,
   * or `app.disable('verbmd')` via API.
   *
   * ```sh
   * $ verb readme:verbmd
   * ```
   * @name verbmd
   * @api public
   */

  app.task('verbmd', { silent: true }, function(cb) {
    debug('loading .verb.md');

    if (app.views.files['README'] || app.views.files['.verb'] || app.options.verbmd === false) {
      cb();
      return;
    }

    // try to load ".verb.md" or custom file from user cwd
    var readme = cwd(app.option('readme') || '.verb.md');
    if (utils.exists(readme)) {
      app.file('README.md', readTemplate(app, readme, app.cwd));
      cb();
      return;
    }
    app.build('ask', cb);
  });

  /**
   * Prompts the user to add a new `.verb.md` template to the current working directory.
   * Useful in sub-generators.
   *
   * ```sh
   * $ verb readme:prompt-verbmd
   * ```
   * @name prompt-verbmd
   * @api public
   */

  app.task('prompt-verbmd', function(cb) {
    // if no .verb.md exists, offer to add one
    app.confirm('verbmd', 'Can\'t find a .verb.md, want to add one?');
    app.ask('verbmd', { save: false }, function(err, answers) {
      if (err) return cb(err);
      if (answers.verbmd) {
        app.build('new', cb);
      } else {
        cb();
      }
    });
  });

  /**
   * User-friendly alias for the [prompt-verbmd]() task. _(This task is aliased with both a
   * terse and long-form name so that in the case this generator is inherited by another
   * and the generator already has an `ask` task, the `prompt-verbmd` task will still be
   * available to use via API.)_
   *
   * ```sh
   * $ verb readme:ask
   * ```
   * @name ask
   * @api public
   */

  app.task('ask', ['prompt-verbmd']);

  /**
   * Load layouts, includes and badges commonly used for generating a README.md.
   *
   * ```sh
   * $ verb readme:templates
   * ```
   * @name templates
   * @api public
   */

  app.task('templates', { silent: true }, function(cb) {
    debug('loading templates');

    app.option('renameKey', function(key, file) {
      var name = file ? file.relative : path.relative(app.cwd, key);
      var ext = path.extname(name);
      var str = name.replace(/^(templates|docs)\/?(layouts|includes)\/?/, '');
      return ext ? str.slice(0, str.length - ext.length) : str;
    });

    // load `docs` templates in user cwd
    app.docs('*.md', {cwd: templates('docs')});
    if (utils.exists(cwd('docs'))) {
      app.docs('*.md', {cwd: path.resolve(app.cwd, 'docs')});
    }

    // load `layout` templates
    app.layouts('*.md', { cwd: templates('layouts') });

    // load `include` templates
    app.includes('**/*.md', { cwd: templates('includes') });
    app.includes(require('./templates/includes'));
    if (utils.exists(cwd('docs'))) {
      app.includes('*.md', {cwd: cwd('docs')});
    }

    // load `badges` templates
    app.badges(require('./templates/badges'));

    if (typeof config.views === 'undefined') {
      cb();
      return;
    }

    // call `.config.process` again to override built-in templates
    // with any templates defined in `package.json`
    app.config.process({views: config.views}, function(err) {
      if (err) return cb(err);
      debug('templates finished');
      cb();
    });
  });

  /**
   * Load `options`, `plugins`, `middleware` and `data` before calling a task
   * to render templats.
   *
   * ```sh
   * $ verb readme:setup
   * ```
   * @name setup
   * @api public
   */

  app.task('setup', {silent: true}, ['options', 'plugins', 'middleware', 'data']);

  /**
   * Generate a README.md from a `.verb.md` template. Runs the [middleware](), [templates](),
   * and [data]() tasks. This is a [verb](){/docs/tasks/#silent} task.
   *
   * ```sh
   * $ verb readme
   * ```
   * @name readme
   * @api public
   */

  app.task('readme', {silent: true}, ['setup', 'templates', 'verbmd'], function(cb) {
    debug('starting readme task');
    var readme = path.resolve(app.cwd, app.option('readme') || '.verb.md');
    var dest = path.resolve(app.option('dest') || app.cwd);

    app.toStream('files', utils.filter(readme)).on('error', cb)
      .pipe(app.renderFile('hbs', app.cache.data)).on('error', cb)
      .pipe(app.renderFile('*', app.cache.data)).on('error', cb)
      .pipe(app.pipeline(app.options.pipeline)).on('error', cb)
      .pipe(app.dest(function(file) {
        file.basename = 'README.md';
        return dest;
      }))
      .on('error', cb)
      .on('end', function() {
        cb();
      })
  });

  /**
   * Alias for the [readme]() task, generates a README.md to the user's working directory.
   *
   * ```sh
   * $ verb readme
   * ```
   * @name default
   * @api public
   */

  app.task('default', ['readme'], function(cb) {
    this.on('finished', app.emit.bind(app, 'readme-generator:end'));
    cb();
  });

  return generator;
};

/**
 * Read a template
 *
 * @param {Object} `verb`
 * @param {String} `fp`
 * @param {String} `base`
 * @return {String}
 */

function readTemplate(app, filepath, base) {
  var dir = base || app.env.templates || templates();
  var absolute = path.resolve(path.resolve(dir), filepath);
  return {
    contents: fs.readFileSync(absolute),
    path: absolute,
  };
}
