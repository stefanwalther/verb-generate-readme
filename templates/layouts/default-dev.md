# {%= name %} {%= badge('npm') %} {%= badge('travis') %}

> {%= description %}

{%= include("highlight") %}

## TOC
<!-- toc -->

## Install
{%= include('install-dev') %}

{% body %}

## Related projects
{%= verb.related.description || "" %}
{%= related(verb.related.list) %}

## Contributing
{%= include("contributing") %}

## Building docs
{%= include("build-docs") %}

## Running tests
{%= include("tests") %}

## Author
{%= include("author") %}

## License
{%= copyright({linkify: true}) %}
{%= license %}

***

{%= include("footer") %}

{%= reflinks(verb.reflinks) %}