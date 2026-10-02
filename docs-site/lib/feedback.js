// The address of the "Give feedback on GitHub" link at the bottom of each
// trust framework page.
//
// The link opens the issue template chooser as before, so the reader still
// picks the kind of feedback. GitHub passes issue form field values in the
// query string through the chooser to the form the reader picks, so the form
// opens with the "Page you were reading" field (id: page) filled in with the
// page title and address. The reader can change it.
//
// GitHub fills in text fields this way, but not dropdowns, so the reader
// still chooses the section themselves.

/**
 * The feedback link for a page.
 *
 * @param {object} options
 * @param {string} options.repositoryUrl  GitHub repository, for example https://github.com/ofdia-uk/dvs-trust-framework
 * @param {string} options.siteUrl        Address of the published site, ending in "/"
 * @param {string} options.pageUrl        The page's address within the site, for example /trust-framework-1.0/part-3/12-service-requirements/
 * @param {string} options.title          The page title
 */
export function feedbackUrl({ repositoryUrl, siteUrl, pageUrl, title }) {
  const pageAddress = new URL(pageUrl.replace(/^\//, ""), siteUrl).href;
  // encodeURIComponent writes spaces as %20, which every reader of the URL
  // treats as a space (a "+" is not always read that way).
  return `${repositoryUrl}/issues/new/choose?page=${encodeURIComponent(`${title} (${pageAddress})`)}`;
}
