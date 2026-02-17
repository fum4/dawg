# This document outlines performance optimization needs

## Rewrite/improve port management

Port management only works for Node based apps, and for setups that are not very complicated. Current setup should be able to work in monorepos, for instance, but it is flaky and, if for instance, there are two environment variables with the same name in two different apps in the same monorepo, it will probably break.

There are several possible approaches to this:

- Improve Node port management and handle other runtimes / environments separately (e.g. Docker-based, separate infrastructure for different languages, etc.)
- Find a way to manage this at a lower level such that it is compatible with any runtime

## Redesign server architecture redesign

One dedicated server is currently opened for each project. The port is saved in a local config file inside the consumer project and agents are routed to this. It would be more resilient if we could handle only one server that handles traffic internally between projects.
