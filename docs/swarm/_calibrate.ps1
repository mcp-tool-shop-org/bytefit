$models = 'mistral-small:24b','devstral-small-2:24b','granite4.1:30b','qwen3.6:27b','gemma4:31b','aya-expanse:32b','qwen3.6:35b-a3b'
$prompt = 'Explain in detail, step by step, how a four-stroke internal combustion engine works, covering intake, compression, power, and exhaust.'
$results = @()
foreach ($m in $models) {
  try {
    $body = @{ model=$m; prompt=$prompt; stream=$false; think=$false; options=@{ num_predict=256; temperature=0 } } | ConvertTo-Json -Compress
    $r = Invoke-RestMethod -Uri 'http://localhost:11434/api/generate' -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 900
    $ps = (ollama ps 2>&1) -join ' || '
    $show = (ollama show $m 2>&1) -join ' ; '
    $evalRate = if ($r.eval_duration -gt 0) { [math]::Round($r.eval_count / ($r.eval_duration/1e9), 2) } else { 0 }
    $promptRate = if ($r.prompt_eval_duration -gt 0) { [math]::Round($r.prompt_eval_count / ($r.prompt_eval_duration/1e9), 2) } else { 0 }
    $results += [pscustomobject]@{ model=$m; eval_count=$r.eval_count; eval_rate_tps=$evalRate; prompt_eval_count=$r.prompt_eval_count; prompt_eval_rate_tps=$promptRate; load_ms=[math]::Round($r.load_duration/1e6,0); total_ms=[math]::Round($r.total_duration/1e6,0); ps=$ps; show=$show }
    Write-Output "measured $m : $evalRate tok/s ($($r.eval_count) tok)"
    ollama stop $m 2>&1 | Out-Null
  } catch {
    $results += [pscustomobject]@{ model=$m; error="$($_.Exception.Message)" }
    Write-Output "ERROR $m : $($_.Exception.Message)"
  }
}
$results | ConvertTo-Json -Depth 4 | Set-Content E:/AI/bytefit/docs/swarm/calibration-raw.json
Write-Output "DONE: $($results.Count) models -> docs/swarm/calibration-raw.json"
