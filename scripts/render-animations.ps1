Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$ErrorActionPreference = 'Stop'

function Get-BitmapBgraBytes($bmp) {
    $rect = New-Object System.Drawing.Rectangle 0, 0, $bmp.Width, $bmp.Height
    $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $bytes = New-Object byte[] ($bmp.Width * $bmp.Height * 4)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
    $bmp.UnlockBits($data)
    return $bytes
}

function Draw-Cursor($g, $x, $y) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddPolygon([System.Drawing.Point[]]@(
        (New-Object System.Drawing.Point ($x), ($y)),
        (New-Object System.Drawing.Point ($x + 12), ($y + 12)),
        (New-Object System.Drawing.Point ($x + 6), ($y + 13)),
        (New-Object System.Drawing.Point ($x + 9), ($y + 20)),
        (New-Object System.Drawing.Point ($x + 6), ($y + 21)),
        (New-Object System.Drawing.Point ($x + 3), ($y + 14)),
        (New-Object System.Drawing.Point ($x), ($y + 17))
    ))
    $g.FillPath([System.Drawing.Brushes]::Black, $p)
    $pInner = New-Object System.Drawing.Drawing2D.GraphicsPath
    $pInner.AddPolygon([System.Drawing.Point[]]@(
        (New-Object System.Drawing.Point ($x + 1), ($y + 2)),
        (New-Object System.Drawing.Point ($x + 10), ($y + 11)),
        (New-Object System.Drawing.Point ($x + 5), ($y + 12)),
        (New-Object System.Drawing.Point ($x + 7), ($y + 18)),
        (New-Object System.Drawing.Point ($x + 6), ($y + 18)),
        (New-Object System.Drawing.Point ($x + 3), ($y + 13)),
        (New-Object System.Drawing.Point ($x + 1), ($y + 15))
    ))
    $g.FillPath([System.Drawing.Brushes]::White, $pInner)
}

function Draw-VSCodeBase($g, $w, $h, $activeAccount, $isWarning = $false) {
    # Main editor background
    $bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#1E1E1E'))
    $g.FillRectangle($bgBrush, 0, 0, $w, $h)
    
    # Left activity bar (narrow)
    $actBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#333333'))
    $g.FillRectangle($actBrush, 0, 0, 48, ($h - 26))

    # Activity icons
    $g.FillRectangle([System.Drawing.Brushes]::White, 14, 18, 20, 2)
    $g.FillRectangle([System.Drawing.Brushes]::White, 14, 24, 20, 2)
    $g.FillRectangle([System.Drawing.Brushes]::White, 14, 30, 20, 2)
    
    # Sidebar
    $sideBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#252526'))
    $g.FillRectangle($sideBrush, 48, 0, 160, ($h - 26))
    $fontSidebar = [System.Drawing.Font]::new('Segoe UI', [single]9, [System.Drawing.FontStyle]::Bold)
    $g.DrawString("EXPLORER", $fontSidebar, [System.Drawing.Brushes]::LightGray, 60, 14)
    
    $fontTree = [System.Drawing.Font]::new('Segoe UI', [single]9, [System.Drawing.FontStyle]::Regular)
    $g.DrawString("v  MY-PROJECT", $fontTree, [System.Drawing.Brushes]::White, 56, 40)
    $g.DrawString("    src", $fontTree, [System.Drawing.Brushes]::LightGray, 60, 62)
    $g.DrawString("      index.ts", $fontTree, [System.Drawing.Brushes]::LightSkyBlue, 70, 84)
    $g.DrawString("    package.json", $fontTree, [System.Drawing.Brushes]::Khaki, 60, 106)
    
    # Editor tabs
    $tabBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#2D2D2D'))
    $g.FillRectangle($tabBrush, 208, 0, ($w - 208), 35)
    $tabActiveBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#1E1E1E'))
    $g.FillRectangle($tabActiveBrush, 208, 0, 140, 35)
    $g.DrawString("index.ts", $fontTree, [System.Drawing.Brushes]::White, 230, 9)

    # Fake code in editor
    $fontCode = [System.Drawing.Font]::new('Consolas', [single]10, [System.Drawing.FontStyle]::Regular)
    $codeBrush1 = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#569CD6'))
    $codeBrush2 = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#DCDCAA'))
    $codeBrush3 = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#CE9178'))
    $codeBrushText = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#D4D4D4'))
    
    $g.DrawString("import", $fontCode, $codeBrush1, 230, 55)
    $g.DrawString("{ switchAccount }", $fontCode, $codeBrushText, 285, 55)
    $g.DrawString("from", $fontCode, $codeBrush1, 420, 55)
    $g.DrawString("'claude-code';", $fontCode, $codeBrush3, 460, 55)

    $g.DrawString("// One-click Claude Code account switcher on Windows!", $fontCode, [System.Drawing.Brushes]::ForestGreen, 230, 85)
    $g.DrawString("export async function", $fontCode, $codeBrush1, 230, 115)
    $g.DrawString("runDemo", $fontCode, $codeBrush2, 385, 115)
    $g.DrawString("() {", $fontCode, $codeBrushText, 440, 115)
    $g.DrawString("  console.log('Active account: $activeAccount');", $fontCode, $codeBrush3, 230, 140)
    $g.DrawString("}", $fontCode, $codeBrushText, 230, 165)

    # Bottom status bar
    $statusColor = if ($isWarning) { '#C56000' } else { '#007ACC' }
    $statBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($statusColor))
    $g.FillRectangle($statBrush, 0, ($h - 26), $w, 26)

    $fontStatus = [System.Drawing.Font]::new('Segoe UI', [single]9, [System.Drawing.FontStyle]::Regular)
    $g.DrawString("main*", $fontStatus, [System.Drawing.Brushes]::White, 55, ($h - 21))
    $g.DrawString("0", $fontStatus, [System.Drawing.Brushes]::White, 105, ($h - 21))
    
    # STATUS BAR BUTTON FOR CLAUDE
    $btnX = 145
    $btnW = 205
    $btnColor = if ($isWarning) { '#883D00' } else { '#1A8AD4' }
    $itemBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($btnColor))
    $g.FillRectangle($itemBrush, $btnX, ($h - 26), $btnW, 26)
    
    # User icon + label
    $fontIcon = [System.Drawing.Font]::new('Segoe UI', [single]9, [System.Drawing.FontStyle]::Bold)
    $g.DrawString("(o) Claude: $activeAccount", $fontIcon, [System.Drawing.Brushes]::White, ($btnX + 10), ($h - 21))

    # Right status bar elements
    $g.DrawString("TypeScript", $fontStatus, [System.Drawing.Brushes]::White, ($w - 110), ($h - 21))
    $g.DrawString("UTF-8", $fontStatus, [System.Drawing.Brushes]::White, ($w - 50), ($h - 21))
}

function Save-RawFrame($bmp, $dir, $filename) {
    $bytes = Get-BitmapBgraBytes $bmp
    $filePath = Join-Path $dir $filename
    [System.IO.File]::WriteAllBytes($filePath, $bytes)
}

# ==============================================================================
# ANIMATION 1: Quick Switch
# ==============================================================================
Write-Host "Rendering Animation 1: Quick Switch..."
$w = 720
$h = 360
$dir1 = Join-Path $PSScriptRoot "frames_switch"
if (Test-Path $dir1) { Remove-Item $dir1 -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dir1 | Out-Null

$frames1 = @()

# Frame 0: Idle on Work account
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
Draw-VSCodeBase $g $w $h "Work" $false
Draw-Cursor $g 400 200
Save-RawFrame $bmp $dir1 "frame_00.raw"
$frames1 += @{ file = "frame_00.raw"; delay = 1000 }

# Frame 1: Cursor moves toward status bar
Draw-VSCodeBase $g $w $h "Work" $false
Draw-Cursor $g 260 280
Save-RawFrame $bmp $dir1 "frame_01.raw"
$frames1 += @{ file = "frame_01.raw"; delay = 350 }

# Frame 2: Hover over status bar button
Draw-VSCodeBase $g $w $h "Work" $false
$g.DrawRectangle([System.Drawing.Pens]::White, 145, ($h - 26), 205, 25)
Draw-Cursor $g 230 ($h - 18)
Save-RawFrame $bmp $dir1 "frame_02.raw"
$frames1 += @{ file = "frame_02.raw"; delay = 500 }

# QuickPick renderer
function Draw-QuickPick($g, $hoverIndex) {
    $qpW = 460
    $qpH = 190
    $qpX = ($w - $qpW) / 2
    $qpY = 25
    
    # Shadow & background
    $qpBg = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#252526'))
    $qpBorder = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#454545'), 1)
    $g.FillRectangle($qpBg, $qpX, $qpY, $qpW, $qpH)
    $g.DrawRectangle($qpBorder, $qpX, $qpY, $qpW, $qpH)
    
    # Input field
    $inBg = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#3C3C3C'))
    $g.FillRectangle($inBg, ($qpX + 8), ($qpY + 8), ($qpW - 16), 28)
    $fontQp = [System.Drawing.Font]::new('Segoe UI', [single]9, [System.Drawing.FontStyle]::Regular)
    $g.DrawString("Choose the Claude account to use", $fontQp, [System.Drawing.Brushes]::LightGray, ($qpX + 16), ($qpY + 13))
    
    # Items
    $items = @(
        @{ icon = "[*]"; name = "Work"; email = "work@company.com"; detail = "Active" },
        @{ icon = "[ ]"; name = "Personal"; email = "ares@example.com"; detail = "" },
        @{ icon = " + "; name = "Add new account..."; email = ""; detail = "" },
        @{ icon = " @ "; name = "Rename account..."; email = ""; detail = "" }
    )
    
    $itemY = $qpY + 44
    for ($i = 0; $i -lt $items.Count; $i++) {
        $item = $items[$i]
        if ($i -eq $hoverIndex) {
            $hoverBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#04395E'))
            $g.FillRectangle($hoverBrush, ($qpX + 4), $itemY, ($qpW - 8), 28)
        }
        
        $fontItem = [System.Drawing.Font]::new('Segoe UI', [single]9, [System.Drawing.FontStyle]::Regular)
        $fontDetail = [System.Drawing.Font]::new('Segoe UI', [single]8, [System.Drawing.FontStyle]::Regular)
        $nameColor = if ($i -eq $hoverIndex) { [System.Drawing.Brushes]::White } else { [System.Drawing.Brushes]::LightGray }
        
        $g.DrawString("$($item.icon) $($item.name)", $fontItem, $nameColor, ($qpX + 12), ($itemY + 5))
        if ($item.email) {
            $g.DrawString($item.email, $fontDetail, [System.Drawing.Brushes]::Gray, ($qpX + 160), ($itemY + 6))
        }
        if ($item.detail) {
            $g.DrawString($item.detail, $fontDetail, [System.Drawing.Brushes]::LightSkyBlue, ($qpX + 380), ($itemY + 6))
        }
        
        $itemY += 30
    }
}

# Frame 3: QuickPick opened, hovering item 0 (Work)
Draw-VSCodeBase $g $w $h "Work" $false
Draw-QuickPick $g 0
Draw-Cursor $g 320 80
Save-RawFrame $bmp $dir1 "frame_03.raw"
$frames1 += @{ file = "frame_03.raw"; delay = 600 }

# Frame 4: Cursor moving down to Personal (index 1)
Draw-VSCodeBase $g $w $h "Work" $false
Draw-QuickPick $g 1
Draw-Cursor $g 330 110
Save-RawFrame $bmp $dir1 "frame_04.raw"
$frames1 += @{ file = "frame_04.raw"; delay = 800 }

# Frame 5: Clicking Personal! Toast appears
Draw-VSCodeBase $g $w $h "Personal" $false
$toastW = 380
$toastH = 65
$toastX = $w - $toastW - 15
$toastY = $h - $toastH - 35
$g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#252526'))), $toastX, $toastY, $toastW, $toastH)
$g.DrawRectangle((New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#007ACC'), 2)), $toastX, $toastY, $toastW, $toastH)
$fontToast = [System.Drawing.Font]::new('Segoe UI', [single]9, [System.Drawing.FontStyle]::Bold)
$g.DrawString("Claude Code Account Switcher", $fontToast, [System.Drawing.Brushes]::LightSkyBlue, ($toastX + 12), ($toastY + 10))
$fontToastBody = [System.Drawing.Font]::new('Segoe UI', [single]9, [System.Drawing.FontStyle]::Regular)
$g.DrawString("Switched to Personal (ares@example.com)", $fontToastBody, [System.Drawing.Brushes]::White, ($toastX + 12), ($toastY + 32))
Draw-Cursor $g 330 110
Save-RawFrame $bmp $dir1 "frame_05.raw"
$frames1 += @{ file = "frame_05.raw"; delay = 1500 }

# Frame 6: Status bar reflects Personal cleanly
Draw-VSCodeBase $g $w $h "Personal" $false
Draw-Cursor $g 500 200
Save-RawFrame $bmp $dir1 "frame_06.raw"
$frames1 += @{ file = "frame_06.raw"; delay = 1800 }

$manifest1 = @{ width = $w; height = $h; frames = $frames1 } | ConvertTo-Json
$manifest1 | Set-Content (Join-Path $dir1 "manifest.json")

# ==============================================================================
# ANIMATION 2: First Configuration & Account Add
# ==============================================================================
Write-Host "Rendering Animation 2: First Setup & Add..."
$dir2 = Join-Path $PSScriptRoot "frames_setup"
if (Test-Path $dir2) { Remove-Item $dir2 -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dir2 | Out-Null

$frames2 = @()

# Frame 0: New login detected toast popup
Draw-VSCodeBase $g $w $h "dev@company.com" $true
$toastW = 420
$toastH = 80
$toastX = $w - $toastW - 15
$toastY = $h - $toastH - 35
$g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#252526'))), $toastX, $toastY, $toastW, $toastH)
$g.DrawRectangle((New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#C56000'), 2)), $toastX, $toastY, $toastW, $toastH)
$fontT = [System.Drawing.Font]::new('Segoe UI', [single]9, [System.Drawing.FontStyle]::Bold)
$g.DrawString("Claude Code Account Switcher", $fontT, [System.Drawing.Brushes]::Orange, ($toastX + 12), ($toastY + 8))
$fontTb = [System.Drawing.Font]::new('Segoe UI', [single]8.5, [System.Drawing.FontStyle]::Regular)
$g.DrawString("New Claude login detected: dev@company.com.`nSave it so you can switch back with one click?", $fontTb, [System.Drawing.Brushes]::White, ($toastX + 12), ($toastY + 28))

# [Save] and [Later] buttons
$btnSaveX = $toastX + $toastW - 140
$g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#0E639C'))), $btnSaveX, ($toastY + 48), 60, 24)
$g.DrawString("Save", $fontTb, [System.Drawing.Brushes]::White, ($btnSaveX + 15), ($toastY + 52))
$btnLaterX = $toastX + $toastW - 70
$g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#3C3C3C'))), $btnLaterX, ($toastY + 48), 60, 24)
$g.DrawString("Later", $fontTb, [System.Drawing.Brushes]::LightGray, ($btnLaterX + 15), ($toastY + 52))

Draw-Cursor $g 450 180
Save-RawFrame $bmp $dir2 "frame_00.raw"
$frames2 += @{ file = "frame_00.raw"; delay = 1200 }

# Frame 1: Cursor hovering [Save]
Draw-VSCodeBase $g $w $h "dev@company.com" $true
$g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#252526'))), $toastX, $toastY, $toastW, $toastH)
$g.DrawRectangle((New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#C56000'), 2)), $toastX, $toastY, $toastW, $toastH)
$g.DrawString("Claude Code Account Switcher", $fontT, [System.Drawing.Brushes]::Orange, ($toastX + 12), ($toastY + 8))
$g.DrawString("New Claude login detected: dev@company.com.`nSave it so you can switch back with one click?", $fontTb, [System.Drawing.Brushes]::White, ($toastX + 12), ($toastY + 28))
$g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#1177BB'))), $btnSaveX, ($toastY + 48), 60, 24)
$g.DrawString("Save", $fontTb, [System.Drawing.Brushes]::White, ($btnSaveX + 15), ($toastY + 52))
$g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#3C3C3C'))), $btnLaterX, ($toastY + 48), 60, 24)
$g.DrawString("Later", $fontTb, [System.Drawing.Brushes]::LightGray, ($btnLaterX + 15), ($toastY + 52))
Draw-Cursor $g ($btnSaveX + 25) ($toastY + 58)
Save-RawFrame $bmp $dir2 "frame_01.raw"
$frames2 += @{ file = "frame_01.raw"; delay = 600 }

# Frame 2: Input box asks for name
function Draw-InputBox($g, $text) {
    $ibW = 460
    $ibH = 65
    $ibX = ($w - $ibW) / 2
    $ibY = 25
    $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#252526'))), $ibX, $ibY, $ibW, $ibH)
    $g.DrawRectangle((New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#007ACC'), 1.5)), $ibX, $ibY, $ibW, $ibH)
    
    $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#3C3C3C'))), ($ibX + 8), ($ibY + 8), ($ibW - 16), 26)
    $fontI = [System.Drawing.Font]::new('Segoe UI', [single]9, [System.Drawing.FontStyle]::Regular)
    $g.DrawString($text, $fontI, [System.Drawing.Brushes]::White, ($ibX + 14), ($ibY + 12))
    
    $fontSub = [System.Drawing.Font]::new('Segoe UI', [single]8, [System.Drawing.FontStyle]::Regular)
    $g.DrawString("Name for account dev@company.com (Press Enter to confirm)", $fontSub, [System.Drawing.Brushes]::LightGray, ($ibX + 10), ($ibY + 40))
}

Draw-VSCodeBase $g $w $h "dev@company.com" $true
Draw-InputBox $g "dev"
Draw-Cursor $g 360 40
Save-RawFrame $bmp $dir2 "frame_02.raw"
$frames2 += @{ file = "frame_02.raw"; delay = 600 }

# Frame 3: Typing "Work"
Draw-VSCodeBase $g $w $h "dev@company.com" $true
Draw-InputBox $g "Work|"
Draw-Cursor $g 360 40
Save-RawFrame $bmp $dir2 "frame_03.raw"
$frames2 += @{ file = "frame_03.raw"; delay = 900 }

# Frame 4: Saved confirmation + status bar changes to Work (normal blue)
Draw-VSCodeBase $g $w $h "Work" $false
$toastW = 340
$toastH = 60
$toastX = $w - $toastW - 15
$toastY = $h - $toastH - 35
$g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#252526'))), $toastX, $toastY, $toastW, $toastH)
$g.DrawRectangle((New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#007ACC'), 2)), $toastX, $toastY, $toastW, $toastH)
$fontToast = [System.Drawing.Font]::new('Segoe UI', [single]9, [System.Drawing.FontStyle]::Bold)
$g.DrawString("Claude Code Account Switcher", $fontToast, [System.Drawing.Brushes]::LightSkyBlue, ($toastX + 12), ($toastY + 10))
$fontToastBody = [System.Drawing.Font]::new('Segoe UI', [single]9, [System.Drawing.FontStyle]::Regular)
$g.DrawString("Account `"Work`" saved.", $fontToastBody, [System.Drawing.Brushes]::White, ($toastX + 12), ($toastY + 30))
Draw-Cursor $g 500 200
Save-RawFrame $bmp $dir2 "frame_04.raw"
$frames2 += @{ file = "frame_04.raw"; delay = 1800 }

$manifest2 = @{ width = $w; height = $h; frames = $frames2 } | ConvertTo-Json
$manifest2 | Set-Content (Join-Path $dir2 "manifest.json")

$g.Dispose()
$bmp.Dispose()
Write-Host "All frames rendered successfully."
