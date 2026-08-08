/**
 * The day a run happened, where the file name gives it up.
 *
 * Apple names each route after the moment it recorded it, which is the one
 * thing a reader can pick a run out of a list by. Strava names them after an
 * ascending activity id, which is nothing anybody recognises — so where there
 * is no date to lift, the bare name is better than a wrong guess.
 *
 * Lifted out of the archive picker when the library started needing the same
 * label for runs that are no longer inside an archive.
 */

/** `route_2024-03-16_7.42am.gpx`, and the plainer variants of it. */
const DATE_IN_NAME = /(\d{4})-(\d{2})-(\d{2})/;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function labelFor(name: string): string {
  const match = DATE_IN_NAME.exec(name);
  if (!match) return name.replace(/\.(fit|gpx)(\.gz)?$/i, "");
  const [, year, month, day] = match;
  const index = Number(month) - 1;
  if (index < 0 || index > 11) return name;
  return `${Number(day)} ${MONTHS[index]} ${year}`;
}
