
$files = Get-ChildItem -Path "d:\community-pluse--main\frontend\src" -Include *.tsx,*.ts,*.css -Recurse
foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $newContent = $content -replace '\[var\((--[^)]+)\)\]', '($1)'
    if ($newContent -ne $content) {
        Write-Host "Fixing Tailwind syntax in $($file.FullName)"
        Set-Content $file.FullName -Value $newContent
    }
}
