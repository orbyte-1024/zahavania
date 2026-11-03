import { reverseSearchLinks } from "@/lib/reverse-search";

export { reverseSearchLinks };

export type LinkEntry = {
  id: string;
  name: string;
  url: string;
  description: string;
};

export function getImageSearchLinks(): LinkEntry[] {
  const links = reverseSearchLinks();
  return [
    {
      id: "google-lens",
      name: links.googleLens.name,
      url: links.googleLens.url,
      description: "Recherche inversée via Google Lens (manuel)",
    },
    {
      id: "tineye",
      name: links.tineye.name,
      url: links.tineye.url,
      description: "Recherche inversée via TinEye (manuel, sans scraping)",
    },
  ];
}
