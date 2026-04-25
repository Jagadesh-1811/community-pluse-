
$path = "d:\community-pluse--main\frontend\src\app\volunteer\page.tsx"
$content = Get-Content $path -Raw
$target = '<span className="text-xl font-black text-\(--foreground\) italic">{need.urgency_score}</span>'
$insertion = '`n                                           {need.life_threat && (`n                                               <div className="absolute -top-2 -right-2 bg-emergency text-white p-1.5 rounded-lg shadow-lg animate-pulse border-2 border-white/20">`n                                                   <ShieldAlert size={16} />`n                                               </div>`n                                           )}'
$newContent = $content -replace [regex]::Escape($target), ($target + $insertion)
Set-Content $path $newContent
