---
vip: '0023'
title: 'First certifications and bias profiles of real models'
status: Idea
created: 2026-11-07
requirement: SIGN-007
depends: ['0014', '0018']
---

## Summary

Run `certifyModel` and `profileModel` on the open-weight models in the example pool and on the first closed models users ask for, at pinned versions. Publish the records in `config/certified-models.json` and on the site, labeled measured, with the date and the suite hash.

## Motivation

The attack suite and the bias profiler are built and tested with scripted models. No real model has been run through either.

## Done when

At least five models certified and profiled, with the map published.

## Tracking

Requirement SIGN-007. Written as the next proposal after v0.0.4-alpha.
