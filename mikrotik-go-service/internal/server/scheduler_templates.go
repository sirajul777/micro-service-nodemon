package server

const cleanupScriptROS6 = `{ :local now [/system clock get date]; :if ([:pick $now 4 5] = "-") do={ :local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"}; :local tgl [:pick $now 8 10]; :local bulan [:pick $now 5 7]; :local tahun [:pick $now 0 4]; :local bln ($arraybln->$bulan); :set $now ($bln."/".$tgl."/".$tahun); }; :foreach u in=[/ip hotspot user find] do={ :local comment [/ip hotspot user get $u comment]; :local ucode [:pick $comment 0 2]; :if($ucode != "vc" and $ucode != "up" and $comment != "") do={ :local expDate [:pick $comment 0 11]; :if ($expDate < $now) do={ /ip hotspot user remove $u; }; }; }; }`

const cleanupScriptROS7 = `
# Function to convert YYYY-MM-DD (RouterOS 7 clock format) into an integer
:local ros7DateInt do={
    :local year [:pick $d 0 4]
    :local month [:pick $d 5 7]
    :local days [:pick $d 8 10]
    :return [:tonum ("$year$month$days")]
}

:local mikhmonDateInt do={
    :local montharray ("jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec")
    :local month [:pick $d 0 3]
    :local days [:pick $d 4 6]
    :local year [:pick $d 7 11]
    :local monthint ([:find $montharray $month])
    :local monthnum ($monthint + 1)
    :if ([:len $monthnum] = 1) do={ :set monthnum ("0" . $monthnum) }
    :return [:tonum ("$year$monthnum$days")]
}

:local timeint do={
    :local hours [:tonum [:pick $t 0 2]]
    :local minutes [:tonum [:pick $t 3 5]]
    :return (($hours * 60) + $minutes)
}

:local today [$ros7DateInt d=[/system clock get date]]
:local curtime [$timeint t=[/system clock get time]]

/ip hotspot user

:foreach i in=[find] do={

    :local comment [get $i comment]
    :local name [get $i name]

    :if ([:pick $comment 3] = "/" and [:pick $comment 6] = "/") do={

        :local gettime [:pick $comment 12 20]
        :local expd [$mikhmonDateInt d=$comment]
        :local expt [$timeint t=$gettime]

        :if ($expd < $today or ($expd = $today and $expt <= $curtime)) do={
            remove $i
            /ip hotspot active remove [find where user=$name]
        }
    }
}
`