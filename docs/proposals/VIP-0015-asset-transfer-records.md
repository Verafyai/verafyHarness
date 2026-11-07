---
vip: '0015'
title: 'Asset transfer records: sell a physical thing, and record that it changed hands'
status: Idea
created: 2026-11-07
requirement: SIGN-004
depends: ['0010', '0011']
---

## Summary

A seller lists a physical item: say, a bicycle. The listing carries:

- photos, including the serial number;
- an ownership document;
- a purchase agreement.

**The sale:**

1. A buyer pays into escrow.
2. On delivery, the buyer photographs the item with a one-time code from the listing in the shot.
3. A jury compares the photos and the serial number, and rules whether the item delivered is the item sold.
4. Escrow pays the seller.

**The records issued:**

- a certificate of transfer;
- a certificate of ownership for the new owner;
- a receipt.

Each record carries the ruling. A localizer maps the records onto what each country requires for that kind of item.

## Motivation

Marketplaces for used goods run on trust and chargebacks. On chain, a token can say who owns a bicycle, but nothing ties the token to the bicycle. The jury is that tie: it rules on evidence that the thing handed over is the thing listed. And it does so at the moment money moves, not after a dispute.

## Proposal (outline)

- **Listing policy.** A policy template, `asset-sale`, for the escrow wallet. Release to the seller only on an APPROVE ruling that the item matches. Refund on REJECT, or if nothing is delivered by a deadline.
- **Evidence:**
  - the seller's listing photos, with the serial number close up;
  - the buyer's delivery photo, with the code written in the shot, so an old or AI-generated photo can't stand in;
  - the documents.

  All are pinned by hash as contract context. This needs juries of multimodal models.
- **Records.** Signed JSON plus a human-readable PDF: parties, item, serial number, price, date, the ruling id and the contract hash. Plainly labeled as Verafy records.
- **Localizer.** For each country and kind of item, the localizer says what's needed beyond the record. Bicycles usually need nothing official. Cars, boats, firearms and land need the government's own registry, and the localizer says so and links to it. It never produces documents that imitate government forms.

## Limits to be plain about

- **Legal effect varies.** A Verafy record is evidence of a sale. Whether it counts as a legal bill of sale or title depends on the country and the item.
- **Photos can be faked.** The one-time code and serial number raise the bar; they don't make fraud impossible. High-value items need more evidence, such as an inspection.

## Decisions for Rex

- Which item categories and countries to start with.
- Whether to partner with an existing marketplace or build one.

## Tracking

Requirement SIGN-004. Not scheduled.
