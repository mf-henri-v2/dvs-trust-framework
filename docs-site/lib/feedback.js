// Feedback links from the reading site to GitHub.
//
// Each link opens the issue template chooser, so the reader still picks the
// kind of feedback. GitHub passes issue form field values in the query string
// through the chooser to the form the reader picks, so the form opens with
// the "Rule or paragraph number" field (id: reference) filled in. The reader
// can change it. (GitHub fills in text fields this way, but not dropdowns.)

/**
 * Where the site is published, used to link back to it from a GitHub issue.
 * The Reading site workflow sets SITE_URL to the GitHub Pages address of the
 * repository it runs in, so a fork links to its own copy.
 */
export const SITE_URL = (process.env.SITE_URL || "https://ofdia-uk.github.io/dvs-trust-framework/").replace(/\/?$/, "/");

/** The full address of a site page, for example /trust-framework-1.0/part-3/12-service-requirements/, optionally at an anchor. */
export function siteAddress(pageUrl, fragment = "", siteUrl = SITE_URL) {
  const address = new URL(pageUrl.replace(/^\//, ""), siteUrl).href;
  return fragment ? `${address}#${fragment}` : address;
}

/** The template chooser with the "Rule or paragraph number" field filled in. */
export function feedbackUrl(repositoryUrl, reference) {
  // encodeURIComponent writes spaces as %20, which every reader of the URL
  // treats as a space (a "+" is not always read that way).
  return `${repositoryUrl}/issues/new/choose?reference=${encodeURIComponent(reference)}`;
}
