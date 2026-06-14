
$path = "$PSScriptRoot\src\app\volunteer\page.tsx"
$content = Get-Content $path -Raw
$content = $content -replace "if \(status === 'in-progress'\) \{", "if (status === 'in-progress' || status === 'resolved') {"
$content = $content -replace "fetch\('http://localhost:8000/notify/dispatch', \{", "fetch('http://localhost:8000/notify/status', {"
$content = $content -replace "body: JSON\.stringify\(\{ need_id: needId \}\)", "body: JSON.stringify({ need_id: needId, status })"
Set-Content $path $content
