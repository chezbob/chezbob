# Vendored JavaScript

These files are committed locally so the application has no runtime CDN
dependency:

- `chart-4.5.1.umd.min.js`: Chart.js 4.5.1 browser bundle, MIT
  - SHA-256: `48444a82d4edcb5bec0f1965faacdde18d9c17db3063d042abada2f705c9f54a`
  - Used for responsive, touch-friendly admin dashboard and item-sales charts.
- `chart-4.5.1-LICENSE.md`: Chart.js MIT license.

- `zxing-library-0.23.0-chezbob.min.js`: customized from
  `@zxing/library` 0.23.0, Apache-2.0
  - SHA-256: `fee21986c92eaccb6a7fc6ff6922a02f631b8c7360472e65d8521bb56438013a`
  - Includes three focused fixes in the upstream `UPCEReader`. `decodeMiddle`
    must return the decoded string with its ending row offset, as the other
    UPC/EAN readers do. `determineNumSysAndCheckDigit` must stringify the
    number system and check digit without prefixing each with an extra zero.
    Finally, `convertUPCEtoUPCA` stores the six digits as character codes, so
    its switch must compare the compression digit with character codes 48–52.
    The published bundle consequently rejects valid UPC-E symbols.
  - Also fixes the shared `StringBuilder.appendChars` loop to compare its loop
    index, rather than the unchanged starting offset. UPC-E expansion uses this
    method and otherwise loops until the browser exhausts its memory.
  - The shared UPC/EAN row reader now uses concrete end-pattern and checksum
    handlers when the reader supplies them, otherwise retaining the base
    handlers used by UPC-A and EAN. UPC-E has a six-module end pattern and must
    expand to UPC-A before checksum validation.
- `zxing-browser-0.2.1-chezbob.min.js`: customized from
  `@zxing/browser` 0.2.1, MIT
  - SHA-256: `88d156b7af89e64818d3422a6f8adee7822176f3b32d56a2803bcb6166c62905`
  - This bundle embeds its own copy of `@zxing/library`, so the same UPC-E and
    `StringBuilder.appendChars` fixes described above are applied there too.

Except for the documented UPC-E fix, the minified bundles and license files
were extracted without modification from the corresponding packages published
on the npm registry. When updating either package, replace its bundle and
license together, check whether the UPC-E fix is still needed, update this
record, and test image upload and live camera scanning before deployment.
