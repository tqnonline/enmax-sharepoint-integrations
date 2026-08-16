#Requires -Version 7
<#
  Tests for Get-PpEnvConfig (Private function).
  WHY each test exists is documented inline — these tests encode business intent,
  not just behavior. A parse bug in Get-PpEnvConfig produces wrong/empty credentials
  that silently authenticate against the wrong environment or fail at runtime.
#>

BeforeAll {
    $RepoRoot  = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent | Split-Path -Parent
    $ManifestPath = Join-Path $RepoRoot 'scripts/PowerPlatform.Deploy/PowerPlatform.Deploy.psd1'
    Import-Module $ManifestPath -Force
}

Describe 'Get-PpEnvConfig' {

    Context 'Parsing — valid .env file' {
        # WHY: The deploy pipeline reads credentials from this file. If the parser mishandles
        # comments, blank lines, or quoted values, it produces empty/wrong creds that cause
        # silent auth failures. Every format variant present in real .env files must parse.
        BeforeAll {
            $script:TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid())
            $envDir = Join-Path $script:TempDir 'code-app'
            New-Item -ItemType Directory -Force -Path $envDir | Out-Null

            $envContent = @'
# This is a comment line — must be ignored
ENVIRONMENT_URL=https://test.crm.dynamics.com

TENANT_ID=tenant-abc-123
CLIENT_ID="quoted-client-id"
CLIENT_SECRET='single-quoted-secret'
ENVIRONMENT_ID=env-id-456
APP_ID=app-789
APP_DISPLAY_NAME=TestApp
'@
            Set-Content -Path (Join-Path $envDir '.env.test') -Value $envContent -Encoding UTF8
        }

        AfterAll {
            Remove-Item -Recurse -Force $script:TempDir -ErrorAction SilentlyContinue
        }

        It 'returns the correct Url alias from ENVIRONMENT_URL' {
            # WHY: Url is the primary key used in pac auth create; wrong value = auth against wrong env
            $tempDir = $script:TempDir
            InModuleScope PowerPlatform.Deploy -Parameters @{ TempDir = $tempDir } {
                $cfg = Get-PpEnvConfig -Environment test -RepoRoot $TempDir
                $cfg.Url | Should -Be 'https://test.crm.dynamics.com'
            }
        }

        It 'strips double quotes from CLIENT_ID' {
            # WHY: .env files commonly wrap secrets in quotes; leaving them causes auth rejection
            $tempDir = $script:TempDir
            InModuleScope PowerPlatform.Deploy -Parameters @{ TempDir = $tempDir } {
                $cfg = Get-PpEnvConfig -Environment test -RepoRoot $TempDir
                $cfg.ClientId | Should -Be 'quoted-client-id'
            }
        }

        It 'strips single quotes from CLIENT_SECRET' {
            # WHY: same as double-quotes — pac rejects a secret value that includes the quote char
            $tempDir = $script:TempDir
            InModuleScope PowerPlatform.Deploy -Parameters @{ TempDir = $tempDir } {
                $cfg = Get-PpEnvConfig -Environment test -RepoRoot $TempDir
                $cfg.ClientSecret | Should -Be 'single-quoted-secret'
            }
        }

        It 'exposes TenantId convenience alias mapping TENANT_ID' {
            $tempDir = $script:TempDir
            InModuleScope PowerPlatform.Deploy -Parameters @{ TempDir = $tempDir } {
                $cfg = Get-PpEnvConfig -Environment test -RepoRoot $TempDir
                $cfg.TenantId | Should -Be 'tenant-abc-123'
            }
        }

        It 'preserves raw ENVIRONMENT_ID key' {
            $tempDir = $script:TempDir
            InModuleScope PowerPlatform.Deploy -Parameters @{ TempDir = $tempDir } {
                $cfg = Get-PpEnvConfig -Environment test -RepoRoot $TempDir
                $cfg['ENVIRONMENT_ID'] | Should -Be 'env-id-456'
            }
        }

        It 'ignores comment lines (does not add them as keys)' {
            # WHY: a comment line parsed as a key would pollute the hashtable and could
            # mask a real key if it happens to have the same prefix
            $tempDir = $script:TempDir
            InModuleScope PowerPlatform.Deploy -Parameters @{ TempDir = $tempDir } {
                $cfg = Get-PpEnvConfig -Environment test -RepoRoot $TempDir
                $cfg.Keys | Should -Not -Contain '# This is a comment line — must be ignored'
            }
        }
    }

    Context 'Error path — file not found (includes worktree fallback not available)' {
        # WHY: When the worktree fallback is also absent (no git common dir or no file there either),
        # the function must throw a clear, actionable error — not silently return an empty hashtable
        # that causes cryptic downstream failures. A full git-common-dir staging test is impractical
        # in unit tests (requires a real worktree), so we assert the not-found error path instead.
        BeforeAll {
            $script:EmptyDir = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid())
            New-Item -ItemType Directory -Force -Path $script:EmptyDir | Out-Null
        }

        AfterAll {
            Remove-Item -Recurse -Force $script:EmptyDir -ErrorAction SilentlyContinue
        }

        It 'throws when .env file is absent and no fallback exists' {
            # WHY: a missing .env should never silently succeed — the caller must fix their setup
            $emptyDir = $script:EmptyDir
            InModuleScope PowerPlatform.Deploy -Parameters @{ EmptyDir = $emptyDir } {
                { Get-PpEnvConfig -Environment nonexistent -RepoRoot $EmptyDir } | Should -Throw
            }
        }

        It 'thrown error message mentions the environment name' {
            # WHY: actionable error messages reduce debugging time for the operator
            $emptyDir = $script:EmptyDir
            InModuleScope PowerPlatform.Deploy -Parameters @{ EmptyDir = $emptyDir } {
                $err = $null
                try { Get-PpEnvConfig -Environment missing -RepoRoot $EmptyDir } catch { $err = $_.Exception.Message }
                $err | Should -BeLike '*missing*'
            }
        }
    }
}
