# This script renames files with Cyrillic characters in russian-bad-words package
# to prevent issues when creating zip archives

$baseDir = ".\node_modules\russian-bad-words\dist\words"

# Function to create a transliteration mapping
function Get-Transliteration {
    $map = @{
        'а' = 'a'; 'б' = 'b'; 'в' = 'v'; 'г' = 'g'; 'д' = 'd'; 'е' = 'e'; 'ё' = 'yo';
        'ж' = 'zh'; 'з' = 'z'; 'и' = 'i'; 'й' = 'y'; 'к' = 'k'; 'л' = 'l'; 'м' = 'm';
        'н' = 'n'; 'о' = 'o'; 'п' = 'p'; 'р' = 'r'; 'с' = 's'; 'т' = 't'; 'у' = 'u';
        'ф' = 'f'; 'х' = 'kh'; 'ц' = 'ts'; 'ч' = 'ch'; 'ш' = 'sh'; 'щ' = 'sch';
        'ъ' = ''; 'ы' = 'y'; 'ь' = ''; 'э' = 'e'; 'ю' = 'yu'; 'я' = 'ya';
    }
    return $map
}

# Get transliteration mapping
$translit = Get-Transliteration

# Function to transliterate a Cyrillic filename to Latin
function Transliterate-Filename {
    param (
        [string]$filename
    )
    
    $extension = [System.IO.Path]::GetExtension($filename)
    $nameOnly = [System.IO.Path]::GetFileNameWithoutExtension($filename)
    $transliterated = ""
    
    foreach ($char in $nameOnly.ToCharArray()) {
        $lowerChar = $char.ToString().ToLower()
        if ($translit.ContainsKey($lowerChar)) {
            $transliterated += $translit[$lowerChar]
        } else {
            $transliterated += $char
        }
    }
    
    return $transliterated + $extension
}

# Process all directories within the base directory
Get-ChildItem -Path $baseDir -Directory | ForEach-Object {
    $subDir = $_.FullName
    Write-Host "Processing directory: $subDir"
    
    # Get all files with Cyrillic characters
    Get-ChildItem -Path $subDir -File | Where-Object { $_.Name -match "[а-яА-Я]" } | ForEach-Object {
        $oldPath = $_.FullName
        $newName = Transliterate-Filename -filename $_.Name
        $newPath = Join-Path -Path $subDir -ChildPath $newName
        
        Write-Host "Renaming: $($_.Name) -> $newName"
        
        # Rename the file
        Rename-Item -Path $oldPath -NewName $newName -Force
        
        # If the file is a TypeScript definition file, update its content references
        if ($_.Extension -eq ".d.ts") {
            $content = Get-Content -Path $newPath -Raw
            $oldName = [System.IO.Path]::GetFileNameWithoutExtension($_.Name)
            $newNameBase = [System.IO.Path]::GetFileNameWithoutExtension($newName)
            
            # Replace references to the old name in the file content
            if ($content -match $oldName) {
                $content = $content -replace $oldName, $newNameBase
                Set-Content -Path $newPath -Value $content
                Write-Host "Updated references inside file: $newPath"
            }
        }
    }
}

Write-Host "File renaming complete. You should now be able to create zip archives without Cyrillic character issues."
