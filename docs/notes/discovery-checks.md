# Discovery checks

7 November 2026. Uses the existing four-city seed catalog.

## Behavior

`/search` accepts `q`, `city`, `category`, `date`, `maxPrice` and `sort`. City pages accept the same filters with the city fixed by their path. Native GET forms produce shareable links and server-rendered results. The city selector includes every catalog city, grouped by country and sorted by name.

Date values: `today`, `weekend`, `week` and `month`. A weekend is Saturday and Sunday; Sunday stays in the current weekend. Next seven days includes today and the next six local calendar dates. Month means the current calendar month. Windows are half open and use each event city's timezone, including daylight saving changes. Ended shows are excluded; sold-out shows remain discoverable.

Sort values: `date`, `price-asc`, `price-desc`. Price ties use start time and event id. Maximum price includes its boundary and accepts zero. Repeated keys use their first value; unsupported values are ignored. Search treats punctuation literally and normalizes both queries and searchable text for Unicode case and composed spelling.

SQL handles city, category, price, dates and ordering. Text matching runs on the server after those filters because the database's built-in lowercasing only handles ASCII. This is suitable for the current small catalog; a larger catalog should use a consistently normalized indexed search column before adding pagination.

## Checks

- Unit coverage executes the query builder against an in-memory database, covering combined filters, title/venue/area/host/lineup matching, literal punctuation, accented titles, zero price, sold-out listings, deterministic sort and local calendar boundaries.
- Production build succeeds. The existing display-font fallback warning remains.
- Hand checked search submission at 375px: text `bijli`, Mumbai and Comedy produce one result and preserve all selected filters in the URL. Document width remains 375px.
- Hand checked a no-match query and its clear-filter and all-city links.
- Hand checked the Mumbai page with Music, maximum price 15 and ascending price: results are priced 8, 12 and 14.
- Confirmed the native city selector exposes an India group containing all four seeded cities.

Automated browser specs remain pending the shared harness. The current browser specs still contain placeholder hooks for that harness. Wallet work remains pending the explicit accounts handoff.
