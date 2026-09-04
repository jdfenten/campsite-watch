// South Carolina State Parks that offer camping reservations through
// reserve.southcarolinaparks.com, with the slug (used in the URL path)
// and numeric parkid (used in the reservation form POST) for each.
//
// Compiled 2026-09-04 by walking the site's own "Select Your Park"
// dropdown, then fetching each candidate's /<slug>/camping/ page and
// reading the hidden `parkid` field. Parks that only offer day-use or
// picnic reservations (no `parkid` on a /camping/ page) are excluded.
export type ParkInfo = {
  slug: string;
  name: string;
  parkId: string;
};

export const PARKS: ParkInfo[] = [
  { slug: "aiken", name: "Aiken", parkId: "1" },
  { slug: "andrew-jackson", name: "Andrew Jackson", parkId: "2" },
  { slug: "baker-creek", name: "Baker Creek", parkId: "3" },
  { slug: "barnwell", name: "Barnwell", parkId: "4" },
  { slug: "calhoun-falls", name: "Calhoun Falls", parkId: "5" },
  { slug: "cheraw", name: "Cheraw", parkId: "7" },
  { slug: "chester", name: "Chester", parkId: "8" },
  { slug: "colleton", name: "Colleton", parkId: "9" },
  { slug: "croft", name: "Croft", parkId: "11" },
  { slug: "devils-fork", name: "Devils Fork", parkId: "12" },
  { slug: "dreher-island", name: "Dreher Island", parkId: "13" },
  { slug: "edisto-beach", name: "Edisto Beach", parkId: "14" },
  { slug: "givhans-ferry", name: "Givhans Ferry", parkId: "15" },
  { slug: "h-cooper-black", name: "H. Cooper Black", parkId: "16" },
  { slug: "hamilton-branch", name: "Hamilton Branch", parkId: "17" },
  { slug: "hickory-knob", name: "Hickory Knob", parkId: "19" },
  { slug: "hunting-island", name: "Hunting Island", parkId: "20" },
  { slug: "huntington-beach", name: "Huntington Beach", parkId: "21" },
  { slug: "keowee-toxaway", name: "Keowee-Toxaway", parkId: "22" },
  { slug: "kings-mountain", name: "Kings Mountain", parkId: "23" },
  { slug: "lake-greenwood", name: "Lake Greenwood", parkId: "24" },
  { slug: "lake-hartwell", name: "Lake Hartwell", parkId: "25" },
  { slug: "lake-wateree", name: "Lake Wateree", parkId: "27" },
  { slug: "lee", name: "Lee", parkId: "29" },
  { slug: "little-pee-dee", name: "Little Pee Dee", parkId: "30" },
  { slug: "jones-gap", name: "Jones Gap", parkId: "31" },
  { slug: "myrtle-beach", name: "Myrtle Beach", parkId: "33" },
  { slug: "oconee", name: "Oconee", parkId: "35" },
  { slug: "paris-mountain", name: "Paris Mountain", parkId: "37" },
  { slug: "poinsett", name: "Poinsett", parkId: "39" },
  { slug: "sadlers-creek", name: "Sadlers Creek", parkId: "43" },
  { slug: "santee", name: "Santee", parkId: "44" },
  { slug: "sesquicentennial", name: "Sesquicentennial", parkId: "45" },
  { slug: "table-rock", name: "Table Rock", parkId: "47" },
];

export function findPark(slug: string): ParkInfo | undefined {
  return PARKS.find((p) => p.slug === slug);
}
