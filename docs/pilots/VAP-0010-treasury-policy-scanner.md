---
vap: '0010'
title: 'Policy review scanner for treasuries'
app: 'Any Squads treasury'
status: Idea
created: 2026-11-07
vips: ['0010']
---

## Summary

A scanner reads a multisig and reports what a policy should cover, using the setup check. It is free, and the report links to attaching a signer.

## The problem today

Many treasuries have paths that move funds without a vote: spending limits, a config authority, or thresholds a few members reach alone.

## What the jury decides

- None: deterministic.

## Why it pays

- Saves money: finds the paths that lose funds before they're used.
- Makes money: it leads to signer attachments.

These are described, not estimated: the pilot is how they get measured.

## What we measure

- Treasuries scanned
- Issues found
- Signers attached after a scan

## Shape

A web page and a CLI command. This could live in Ecosystem IQ.

## Done when

One hundred treasuries scanned, with results published in aggregate.

Then this VAP moves to Live, and to Closed when the result is published.
