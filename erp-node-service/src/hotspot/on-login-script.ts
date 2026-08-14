/**
 * MikHMon on-login script build/parse — ported verbatim from the monolith's
 * `MikrotikController` (private methods `buildOnLoginScript`,
 * `buildOnLoginHeader`, `parseOnLogin`).
 *
 * This is deliberately kept as plain, RouterOS-connection-free functions:
 * mikrotik-go-service doesn't understand this encoding at all — it just
 * writes whatever `on_login` string it's given (see AddHotspotProfile /
 * UpdateHotspotProfile in server.go). All the "smart" logic — encoding
 * price/validity/expiry-mode into the script header, and being able to
 * read it back out later — lives here.
 *
 * Header format (always the first statement in the script):
 *   :put (",expmode,price,validity,sprice,,lockuser,");
 */

export interface OnLoginMeta {
  expmode: string;
  price: number;
  validity: string;
  sprice: number;
  lockUser: string;
}

const EMPTY_META: OnLoginMeta = { expmode: '', price: 0, validity: '', sprice: 0, lockUser: '' };

export function parseOnLogin(onLogin: string): OnLoginMeta {
  if (!onLogin) return { ...EMPTY_META };
  const match = onLogin.match(/:put \("([^"]*)"\)/);
  if (!match) return { ...EMPTY_META };
  const p = match[1].split(',');
  return {
    expmode: (p[1] || '').trim(),
    price: parseFloat(p[2]) || 0,
    validity: (p[3] || '').trim(),
    sprice: parseFloat(p[4]) || 0,
    lockUser: (p[6] || '').trim(),
  };
}

/** Build only the header line (used when just re-reading/updating metadata). */
export function buildOnLoginHeader(
  expmode: string,
  price: number,
  validity: string,
  sprice: number,
  lockUser: string,
): string {
  return `:put (",${expmode},${price},${validity},${sprice},,${lockUser},");`;
}

/**
 * Build the full MikHMon-compatible on-login script.
 *
 * ROS 7: date format is YYYY-MM-DD, needs arraybln conversion.
 * ROS 6: date format is Mon/DD/YYYY — no conversion needed.
 */
export function buildOnLoginScript(
  expmode: string,
  price: number,
  validity: string,
  sprice: number,
  lockUser: string,
  profileName: string,
  rosVersion: string,
): string {
  const header = `:put (",${expmode},${price},${validity},${sprice},,${lockUser},");`;

  const lockSnip =
    lockUser === 'Enable'
      ? ` [:local mac $"mac-address"; /ip hotspot user set mac-address=$mac [find where name=$user]]`
      : '';

  const recordSnip =
    expmode === 'remc' || expmode === 'ntfc'
      ? ` :local mac $"mac-address"; :local time [/system clock get time ]; /system script add name="$date-|-$time-|-$user-|-${price}-|-$address-|-$mac-|-${validity}-|-${profileName}-|-$comment" owner="$month$year" source="$date" comment="mikhmon";`
      : '';

  if (rosVersion === '7') {
    const body =
      `{:local comment [ /ip hotspot user get [/ip hotspot user find where name="$user"] comment]; :local ucode [:pick $comment 0 2]; :if ($ucode = "vc" or $ucode = "up" or $comment = "") do={ :local date [ /system clock get date ];:if ([:pick $date 4 5] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $date 8 10];:local bulan [:pick $date 5 7];:local tahun [:pick $date 0 4];:local bln ($arraybln->$bulan);:set $date ($bln."/".$tgl."/".$tahun);};:local year [ :pick $date 7 11 ];:local month [ :pick $date 0 3 ]; /sys sch add name="$user" disable=no start-date=$date interval="${validity}"; :delay 5s; :local exp [ /sys sch get [ /sys sch find where name="$user" ] next-run];:if ([:pick $exp 2 3] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $exp 3 5];:local bulan [:pick $exp 0 2];:local bln ($arraybln->$bulan);:local jam [:pick $exp 11 19];:set $exp ($bln."/".$tgl." ".$jam);};:if ([:pick $exp 4 5] = "-") do={:local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"};:local tgl [:pick $exp 8 10];:local bulan [:pick $exp 5 7];:local tahun [:pick $exp 0 4];:local bln ($arraybln->$bulan);:local jam [:pick $exp 11 19];:set $exp ($bln."/".$tgl."/".$tahun." ".$jam);}; :local getxp [len $exp]; :if ($getxp = 15) do={ :local d [:pick $exp 0 6]; :local t [:pick $exp 7 16]; :local s ("/"); :local exp ("$d$s$year $t"); /ip hotspot user set comment="$exp" [find where name="$user"];}; :if ($getxp = 8) do={ /ip hotspot user set comment="$date $exp" [find where name="$user"];}; :if ($getxp > 15) do={ /ip hotspot user set comment="$exp" [find where name="$user"];};:delay 5s; /sys sch remove [find where name="$user"];${recordSnip}${lockSnip}}}`;
    return `${header} ${body}`;
  }

  const body =
    `{:local comment [ /ip hotspot user get [/ip hotspot user find where name="$user"] comment]; :local ucode [:pick $comment 0 2]; :if ($ucode = "vc" or $ucode = "up" or $comment = "") do={ :local date [ /system clock get date ];:local year [ :pick $date 7 11 ]; :local month [ :pick $date 0 3 ]; /sys sch add name="$user" disable=no start-date=$date interval="${validity}"; :delay 5s; :local exp [ /sys sch get [ /sys sch find where name="$user" ] next-run]; :local getxp [len $exp]; :if ($getxp = 15) do={ :local d [:pick $exp 0 6]; :local t [:pick $exp 7 16]; :local s ("/"); :local exp ("$d$s$year $t"); /ip hotspot user set comment="$exp" [find where name="$user"];}; :if ($getxp = 8) do={ /ip hotspot user set comment="$date $exp" [find where name="$user"];}; :if ($getxp > 15) do={ /ip hotspot user set comment="$exp" [find where name="$user"];};:delay 5s; /sys sch remove [find where name="$user"];${recordSnip}${lockSnip}}}`;
  return `${header} ${body}`;
}

/**
 * Merge a raw HotspotProfile (from mikrotik-go-service) with local
 * profile-meta (price/validity/color/caption fallback) into the shape the
 * frontend expects. Script metadata (embedded in on-login) takes priority
 * over the locally-stored fallback, matching the monolith's exact rule.
 */
export function mergeProfile(
  profile: { onLogin?: string; name?: string; [key: string]: any },
  meta: { price?: number; validity?: string; profileColor?: string; caption?: string } | undefined,
): any {
  const ol = parseOnLogin(profile.onLogin || '');
  const loc = meta || {};
  return {
    ...profile,
    price: ol.price || loc.price || 0,
    sprice: ol.sprice || 0,
    validity: ol.validity || loc.validity || '',
    expmode: ol.expmode || '',
    lockUser: ol.lockUser || '',
    profileColor: loc.profileColor || '#1f6feb',
    caption: loc.caption || '',
  };
}
