# Worldwide catalog import

Imported from the supplied research drafts on 7 November 2026. No additional event research or independent verification was performed.

## Selection

The four draft files contain 56 records. The supplied confidence labels mark 32 high. Requiring a price, a parseable date and a named venue leaves 21 eligible records. The other 11 high-confidence records have no published price and are skipped. Medium and low confidence records are not imported.

The seed retains 28 existing sample shows and adds those 21 records: 49 test listings across 20 cities. Mumbai, Bengaluru, Delhi and Pune each have at least three bookable listings. No other city has three eligible records; the five-city stretch target is not met. Existing Mumbai ids 1 through 18 are retained. Other samples use 19 through 28; imported records use 29 through 49. Local deployment must be seeded before those ids are actually bookable on a chain.

Every imported record keeps its source title, price, timezone, official link and source link. Whole-dollar prices are draft conversions for test USDT payments, not current seller quotes. Conference listings appear under Workshops; festivals appear under Music. Stadium venues use the app's Arena kind; halls use Arts space. Theatre, auditorium and arena test listings use assigned seats. All other kinds use general admission. These are test booking choices, not a claim about the organiser's seating plan.

## Published facts and test settings

Official unknowns display exactly `Not published`. A zero door timestamp marks an unpublished door time; the shared formatter renders the marker, including existing ticket and door components. Unknown age rules use -1, unknown duration uses 0, and unknown venue capacity uses 0. The public display checks the source fact flags before presenting these fields. Date-only draft placeholders do not appear as midnight start times. Three ends explicitly calculated from duration in the draft notes are marked derived and do not become published end times. Capacities identified in the notes as unofficial estimates are not presented as published venue capacities.

Each imported show has an internal allocation of 100 test tickets. This is not a real venue capacity. If an official timed end is absent, the internal test booking window ends 24 hours after the stored start date. That timestamp is never presented as an official end time. The show page labels allocations and booking windows as test settings. Missing doors do not become invented opening times, and missing ages do not become an all-ages claim. Unknown language is also marked as not published.

Imported listings use a `Houseful test listings` host, with explicit wording that it is not the real organiser. Each show page says `Test listing, not affiliated` and links to the official event and seller. The retained samples with no official link are explicitly marked as sample shows. No generated poster uses artist photos or logos.

The chain seed uses the start date for its internal cutoff calculation when doors are unpublished. It does not create an official door time. Live deployment and live purchase verification remain separate from the database import and local test run.
