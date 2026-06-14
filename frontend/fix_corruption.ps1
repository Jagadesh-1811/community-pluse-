
$path = "$PSScriptRoot\src\app\volunteer\page.tsx"
$content = Get-Content $path -Raw
$bad = '<div className="absolute top-0 right-0 p-8 border-b border-l border-\(--foreground\)/10 bg-\(--background\)/50 backdrop-blur-md z-50 rounded-bl-3xl"></div>'
$good = '<div className="w-full h-full rounded-[0.9rem] bg-(--background)/80 backdrop-blur-sm"></div>'
# Note: the parentheses in the $bad string might need escaping in the regex match
$content = $content -replace '<div className="absolute top-0 right-0 p-8 border-b border-l border-\(--foreground\)/10 bg-\(--background\)/50 backdrop-blur-md z-50 rounded-bl-3xl"></div>', $good
Set-Content $path $content
