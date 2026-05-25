export interface ContentScriptManifest {
  content_scripts?: Array<{
    js?: string[]
    [key: string]: unknown
  }>
  web_accessible_resources?: Array<{
    resources?: string[]
    [key: string]: unknown
  }>
  [key: string]: unknown
}

export interface StableContentScriptResult {
  manifest: ContentScriptManifest
  copies: Array<{
    from: string
    to: string
  }>
}

const HASHED_ASSET_RE = /^assets\/(.+)-[A-Za-z0-9_-]{8,}\.js$/

export const stableContentScriptPath = (path: string): string | null => {
  const match = path.match(HASHED_ASSET_RE)
  if (!match) return null

  const baseName = match[1]
    .replace(/\.ts-loader$/, '-loader')
    .replace(/\.ts$/, '')

  return `assets/${baseName}.js`
}

export const stabilizeContentScriptManifest = (
  manifest: ContentScriptManifest
): StableContentScriptResult => {
  const copies: StableContentScriptResult['copies'] = []
  const replacements = new Map<string, string>()

  const contentScripts = manifest.content_scripts?.map(script => {
    const js = script.js?.map(path => {
      const stablePath = stableContentScriptPath(path)
      if (!stablePath) return path

      replacements.set(path, stablePath)
      copies.push({ from: path, to: stablePath })
      return stablePath
    })

    return js ? { ...script, js } : script
  })

  const webAccessibleResources = manifest.web_accessible_resources?.map(entry => {
    if (!entry.resources) return entry

    return {
      ...entry,
      resources: entry.resources.map(resource => replacements.get(resource) ?? resource)
    }
  })

  return {
    manifest: {
      ...manifest,
      ...(contentScripts ? { content_scripts: contentScripts } : {}),
      ...(webAccessibleResources ? { web_accessible_resources: webAccessibleResources } : {})
    },
    copies
  }
}
