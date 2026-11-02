/**
 * Destinations for manual reverse image search, centralised so no URL is
 * duplicated across routes. The list is closed: the API returns these exact
 * addresses and never accepts a client-supplied URL, so no open redirect (and
 * no parameter tampering) can be built from user input.
 */
export type ReverseSearchService = {
  /** Product name, safe to display as-is. */
  name: string;
  /** Fixed HTTPS landing page, with no query string and no user data in it. */
  url: string;
};

export type ReverseSearch = {
  googleLens: ReverseSearchService;
  tineye: ReverseSearchService;
};

const DESTINATIONS = {
  googleLens: { name: "Google Lens", url: "https://lens.google.com/" },
  tineye: { name: "TinEye", url: "https://tineye.com/" },
} as const satisfies ReverseSearch;

/**
 * Returns the services a journalist can open to look for an image himself.
 *
 * No search is performed here: nothing is fetched, nothing is uploaded, and
 * the image is not sent to these services. The links carry no filename, no
 * metadata and no coordinate, so the response says "search it there", never
 * "it was found there".
 */
export function reverseSearchLinks(): ReverseSearch {
  return {
    googleLens: { ...DESTINATIONS.googleLens },
    tineye: { ...DESTINATIONS.tineye },
  };
}

