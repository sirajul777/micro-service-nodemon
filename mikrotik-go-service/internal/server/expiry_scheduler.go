package server

// cleanupScriptROS6 preserves the legacy Mikhmon expiry cleanup behavior on
// RouterOS 6, where /system clock get date returns mon/dd/yyyy.
const cleanupScriptROS6 = `:foreach i in=[/ip hotspot user find where disabled=no] do={ :local comment [/ip hotspot user get $i comment]; :if ($comment != "") do={ :local dash [:find $comment "-"]; :if ($dash > 0) do={ :local exp [:pick $comment 0 $dash]; :local now [/system clock get date]; :if ($exp < $now) do={ /ip hotspot user remove $i; } } } }`

// cleanupScriptROS7 normalizes RouterOS 7's yyyy-mm-dd clock format before
// comparing the stored expiry date in hotspot user comments.
const cleanupScriptROS7 = `:local ros7DateInt do={ :local d $1; :return ([:tonum [:pick $d 0 4]] * 10000 + [:tonum [:pick $d 5 7]] * 100 + [:tonum [:pick $d 8 10]]) }; :local mikhmonDateInt do={ :local d $1; :local arraybln {"jan"=1;"feb"=2;"mar"=3;"apr"=4;"may"=5;"jun"=6;"jul"=7;"aug"=8;"sep"=9;"oct"=10;"nov"=11;"dec"=12}; :local mon [:pick [:tolower $d] 0 3]; :return ([:tonum [:pick $d 7 11]] * 10000 + ($arraybln->$mon) * 100 + [:tonum [:pick $d 4 6]]) }; :local timeint do={ :local t $1; :return ([:tonum [:pick $t 0 2]] * 3600 + [:tonum [:pick $t 3 5]] * 60 + [:tonum [:pick $t 6 8]]) }; :local now [/system clock get date]; :local nowInt [$ros7DateInt $now]; :foreach i in=[/ip hotspot user find where disabled=no] do={ :local comment [/ip hotspot user get $i comment]; :if ($comment != "") do={ :local sep [:find $comment " "]; :if ($sep > 0) do={ :local expDate [:pick $comment 0 $sep]; :local expTime [:pick $comment ($sep + 1) ($sep + 9)]; :local expInt [$mikhmonDateInt $expDate]; :if ($expInt < $nowInt) do={ /ip hotspot user remove $i } } } }`
