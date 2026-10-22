$base = "http://localhost:4000/api"
$login = Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType "application/json" -Body (@{tenantSlug="walnut";email="salha@walnut.local";password="walnut@123"} | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.token)" }
function Api($m, $p, $b) {
  if ($b) { Invoke-RestMethod -Method $m -Uri "$base$p" -Headers $h -ContentType "application/json" -Body ($b | ConvertTo-Json -Depth 5) }
  else { Invoke-RestMethod -Method $m -Uri "$base$p" -Headers $h }
}

# master data
$treat = Api Get "/treatments"; $machines = Api Get "/machines"; $rooms = Api Get "/rooms"
$staff = Api Get "/staff"; $tpl = Api Get "/package-templates"
$ems = $treat | Where-Object name -eq "Emsculpt"
$ems01 = $machines | Where-Object code -eq "EMS-01"; $ems02 = $machines | Where-Object code -eq "EMS-02"
$marcial = $staff | Where-Object name -eq "Marcial"; $carol = $staff | Where-Object name -eq "Carol"
$room1 = $rooms | Where-Object name -eq "Room 1"; $room2 = $rooms | Where-Object name -eq "Room 2"
$start = (Get-Date).Date.AddDays(1).AddHours(14).ToString("yyyy-MM-ddTHH:mm:ss")

Write-Host "`n1) Client + measurements + consultation (15-day review auto-set)" -ForegroundColor Cyan
$client = Api Post "/clients" @{ name="Demo Client A"; mobile="0501234567"; consentSigned=$true }
Api Post "/clients/$($client.id)/measurements" @{ weightKg=82; heightCm=165; bodyFatPct=34; waistCm=95 } | Out-Null
Api Post "/clients/$($client.id)/consultations" @{ notes="Initial assessment"; plan="Emsculpt course" } | Out-Null
$client.clientNo

Write-Host "`n2) Assign Emsculpt x10 package" -ForegroundColor Cyan
$pkg = Api Post "/clients/$($client.id)/packages" @{ templateId = ($tpl | Where-Object name -like "Emsculpt*").id }
$item = $pkg.items[0]

Write-Host "`n3) Book EMS-01 + Marcial + Room 1 at 2 PM tomorrow" -ForegroundColor Cyan
$a1 = Api Post "/appointments" @{ clientId=$client.id; treatmentId=$ems.id; therapistId=$marcial.id; machineId=$ems01.id; roomId=$room1.id; startAt=$start; clientPackageItemId=$item.id }
"Booked: $($a1.status)"

Write-Host "`n4) Another client tries the SAME machine at the same time -> must be blocked" -ForegroundColor Yellow
$clientB = Api Post "/clients" @{ name="Demo Client B"; mobile="0507654321" }
try {
  Api Post "/appointments" @{ clientId=$clientB.id; treatmentId=$ems.id; therapistId=$carol.id; machineId=$ems01.id; roomId=$room2.id; startAt=$start } | Out-Null
} catch { Write-Host ("BLOCKED: " + ($_.ErrorDetails.Message | ConvertFrom-Json).error) -ForegroundColor Red }

Write-Host "`n5) Same slot with EMS-02 + Carol + Room 2 -> allowed" -ForegroundColor Green
$a2 = Api Post "/appointments" @{ clientId=$clientB.id; treatmentId=$ems.id; therapistId=$carol.id; machineId=$ems02.id; roomId=$room2.id; startAt=$start }
Write-Host "Booked: $($a2.status)"

Write-Host "`n6) Complete Client A's session -> balance drops" -ForegroundColor Cyan
$done = Api Post "/appointments/$($a1.id)/complete" @{ confirm=$true; notes="Session delivered" }
Write-Host "Sessions remaining after completion: $($done.remaining)"
(Api Get "/clients/$($client.id)/packages").items | Select-Object @{n="treatment";e={$_.treatment.name}}, totalSessions, usedSessions, remaining | Format-Table -AutoSize | Out-Host

Write-Host "`n7) Follow-ups due in next 20 days" -ForegroundColor Cyan
$due = Api Get "/followups/due?withinDays=20"
$due | Select-Object clientNo, name, nextReviewDate, overdue | Format-Table -AutoSize | Out-Host

Write-Host "`n8) Machine utilisation (next 3 days)" -ForegroundColor Cyan
$from = (Get-Date).Date.ToString("yyyy-MM-dd"); $to = (Get-Date).Date.AddDays(3).ToString("yyyy-MM-dd")
$util = Api Get "/reports/machine-utilisation?from=$from&to=$to"
$util | Where-Object { $_.bookedMinutes -gt 0 } | Format-Table -AutoSize | Out-Host