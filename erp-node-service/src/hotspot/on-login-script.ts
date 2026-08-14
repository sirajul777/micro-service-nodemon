/**
 * Mikhmon-compatible hotspot on-login script builder.
 *
 * The generated script is intentionally RouterOS-version agnostic: it detects
 * the clock date format at runtime (ROS6: mon/dd/yyyy, ROS7: yyyy-mm-dd),
 * normalizes expiry to a common mon/dd/yyyy HH:mm:ss comment, records the
 * selling script, and optionally locks the user's MAC address.
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
  const match = onLogin.match(/:put \(\"([^\"]*)\"\)/);
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

export function buildOnLoginHeader(
  expmode: string,
  price: number,
  validity: string,
  sprice: number,
  lockUser: string,
): string {
  return `:put (\",${expmode},${price},${validity},${sprice},,${lockUser},\");`;
}

export function buildOnLoginScript(
  expmode: string,
  price: number,
  validity: string,
  sprice: number,
  lockUser: string,
  profileName: string,
  _rosVersion: string,
): string {
  const header = buildOnLoginHeader(expmode, price, validity, sprice, lockUser);

  const recordSnip =
    expmode === 'remc' || expmode === 'ntfc'
      ? ` :local mac $\"mac-address\"; :local time [/system clock get time]; /system script add name=\"$nowDate-|-$nowClock-|-$user-|-${price}-|-$address-|-$mac-|-${validity}-|-${profileName}-|-$comment\" owner=\"$nowBln$nowThn\" source=\"$nowDate\" comment=\"mikhmon\";`
      : '';

  const lockSnip =
    lockUser === 'Enable'
      ? ` :local mac $\"mac-address\"; /ip hotspot user set mac-address=$mac [find where name=$user];`
      : '';

  const body =
    `:local comment [/ip hotspot user get [/ip hotspot user find where name=\"$user\"] comment]; ` +
    `:local ucode [:pick $comment 0 2]; ` +
    `:if ($ucode = \"vc\" or $ucode = \"up\" or $comment = \"\") do={ ` +
      `:local nowDate [/system clock get date]; ` +
      `:local nowClock [/system clock get time]; ` +
      `:local nowTime ($nowDate.\" \".$nowClock); ` +
      `/system scheduler add name=\"$user\" disable=no start-date=$nowDate start-time=$nowClock interval=\"${validity}\"; ` +
      `:local expTime [/system scheduler get [/system scheduler find where name=\"$user\"] next-run]; ` +
      `/system scheduler remove [find where name=\"$user\"]; ` +
      `:local nowLen [len $nowDate]; ` +
      `:local expLen [len $expTime]; ` +
      `:local nowThn; :local nowBln; :local nowTgl; ` +
      `:if ($nowLen = 11) do={ ` +
        `:set $nowThn [:pick $nowDate 7 11]; ` +
        `:set $nowBln [:pick $nowDate 0 3]; ` +
        `:set $nowTgl [:pick $nowDate 4 6]; ` +
        `:if ($expLen = 8) do={ :local expDate [:pick $nowDate 0 11]; :local expClock [:pick $expTime 0 8]; :set $expTime ($expDate.\" \".$expClock); }; ` +
        `:if ($expLen = 15) do={ :local expThn [:pick $nowDate 7 11]; :local expBln [:pick $expTime 0 3]; :local expTgl [:pick $expTime 4 6]; :local expDate ($expBln.\"/\".$expTgl.\"/\".$expThn); :local expClock [:pick $expTime 7 15]; :set $expTime ($expDate.\" \".$expClock); }; ` +
        `:if ($expLen = 20) do={ :local expDate [:pick $expTime 0 11]; :local expClock [:pick $expTime 12 20]; :set $expTime ($expDate.\" \".$expClock); }; ` +
      `}; ` +
      `:if ($nowLen = 10) do={ ` +
        `:local montharray {\"01\"=\"jan\";\"02\"=\"feb\";\"03\"=\"mar\";\"04\"=\"apr\";\"05\"=\"may\";\"06\"=\"jun\";\"07\"=\"jul\";\"08\"=\"aug\";\"09\"=\"sep\";\"10\"=\"oct\";\"11\"=\"nov\";\"12\"=\"dec\"}; ` +
        `:set $nowThn [:pick $nowDate 0 4]; ` +
        `:set $nowBln [:pick $nowDate 5 7]; ` +
        `:set $nowTgl [:pick $nowDate 8 10]; ` +
        `:set $nowBln ($montharray->$nowBln); ` +
        `:set $nowDate ($nowBln.\"/\".$nowTgl.\"/\".$nowThn); ` +
        `:if ($expLen = 8) do={ :local expThn [:pick $nowThn 0 4]; :local expBln [:pick $nowDate 0 3]; :local expTgl [:pick $nowDate 4 6]; :local expDate ($expBln.\"/\".$expTgl.\"/\".$expThn); :local expClock [:pick $expTime 0 8]; :set $expTime ($expDate.\" \".$expClock); }; ` +
        `:if ($expLen = 14) do={ :local expThn $nowThn; :local expBln [:pick $expTime 0 2]; :local expTgl [:pick $expTime 3 5]; :set $expBln ($montharray->$expBln); :local expDate ($expBln.\"/\".$expTgl.\"/\".$expThn); :local expClock [:pick $expTime 6 14]; :set $expTime ($expDate.\" \".$expClock); }; ` +
        `:if ($expLen = 19) do={ :local expThn [:pick $expTime 0 4]; :local expBln [:pick $expTime 5 7]; :local expTgl [:pick $expTime 8 10]; :set $expBln ($montharray->$expBln); :local expDate ($expBln.\"/\".$expTgl.\"/\".$expThn); :local expClock [:pick $expTime 11 19]; :set $expTime ($expDate.\" \".$expClock); }; ` +
      `}; ` +
      `/log warning \"Fazznet Mikhmon Online : hotspot user $user first login at $nowTime and will expire at $expTime\"; ` +
      `/ip hotspot user set comment=\"$expTime\" [find where name=\"$user\"]; ` +
      `:delay 5s;` +
      recordSnip +
      lockSnip +
    `}`;

  return `${header} /log warning \"Fazznet Mikhmon Online : now in version 25.02.23 and monitoring the hotspot server on this mikrotik\"; ${body}`;
}

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
