#
# Module manifest for PowerPlatform.Deploy
#

@{
    RootModule        = 'PowerPlatform.Deploy.psm1'
    ModuleVersion     = '0.1.0'
    GUID              = 'd13c58fd-2d44-40ee-9303-2aa4ae9d2dda'
    Author            = 'Enmax AutoCAD Team'
    CompanyName       = 'Enmax'
    Description       = 'PowerShell deploy tooling for the Enmax AutoCAD Power Platform solution. Wraps pac CLI auth, env-config loading, and solution deployment steps.'
    PowerShellVersion = '7.0'

    FunctionsToExport = @('Connect-PpDataverse', 'Invoke-PpDeploy', 'Publish-PpCodeApp', 'Register-PpPlugins')
    CmdletsToExport   = @()
    VariablesToExport = @()
    AliasesToExport   = @()
}
