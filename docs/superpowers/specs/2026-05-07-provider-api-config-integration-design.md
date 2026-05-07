# Provider API Configuration Integration - Design Spec

**Created:** 2026-05-07
**Status:** Draft
**Scope:** Integrate 54 AI providers from providers.json into Vision API configuration UI

---

## Summary

Refactor Vision API configuration from single-config (`_visionApiConfig`) to multi-provider architecture (`_providerConfigs` array + `_activeConfigId`). Enable users to:
1. Select from 52 supported providers (filtered from providers.json)
2. Store multiple API configurations with quick switching
3. Use Tab-based UI: "Quick Config" (preset selection) vs "Custom Config" (manual input)

**API Format Coverage:** 52/54 providers supported (anthropic_messages, chat_completions)

---

## 1. Data Layer Design

### 1.1 Storage Keys

```typescript
// src/shared/constants.ts
export const PROVIDER_CONFIGS_STORAGE_KEY = '_providerConfigs'

// Legacy (for migration)
export const LEGACY_VISION_API_CONFIG_KEY = '_visionApiConfig'
```

### 1.2 ProviderConfig Interface

```typescript
// src/shared/types.ts
export interface ProviderConfig {
  id: string                    // UUID (crypto.randomUUID())
  providerId: string            // Provider ID from providers.json, or 'custom'
  providerName: string          // Display name (e.g., 'Anthropic Claude')
  apiKey: string                // API key — NEVER log this
  apiEndpoint: string           // Full API URL
  apiFormat: 'anthropic_messages' | 'chat_completions'
  selectedModel: string         // User-selected model
  configuredAt: number          // Timestamp
  isCustom?: boolean            // true for custom configs
}
```

### 1.3 Storage Structure

```typescript
interface ProviderConfigsStorage {
  configs: ProviderConfig[]
  activeConfigId: string | null
}

const DEFAULT_STORAGE: ProviderConfigsStorage = {
  configs: [],
  activeConfigId: null
}
```

---

## 2. Provider Data Processing

### 2.1 Supported Formats

```typescript
const SUPPORTED_FORMATS = ['anthropic_messages', 'chat_completions'] as const
```

**Unsupported formats (4 providers):**
- `gemini_native` — Google Gemini (requires separate implementation)
- `bedrock_converse_stream` — AWS Bedrock (requires AWS SDK)
- `openai_chat` — GitHub Copilot (OAuth-based)
- `openai_responses` — Codex (OAuth-based)

### 2.2 Provider Interface

```typescript
// src/lib/provider-data.ts
export interface Provider {
  id: string                              // Generated from name (slug)
  name: string                            // Display name
  type: 'official' | 'cn_official' | 'aggregator' | 'third_party'
  apiEndpoint: string                     // Default API URL
  apiFormat: 'anthropic_messages' | 'chat_completions'
  models: string[]                        // Available models
  icon: string                            // Icon identifier
  iconColor: string                       // Icon color
  websiteUrl?: string                     // Official website
  apiKeyUrl?: string                      // API key management page
  isPartner?: boolean                     // Partner flag
}
```

### 2.3 Filtering Logic

```typescript
export function loadSupportedProviders(): Provider[] {
  const providersData = providersJson.providers
  const supported: Provider[] = []
  const unsupported: { name: string; format: string }[] = []
  
  for (const p of providersData) {
    if (SUPPORTED_FORMATS.includes(p.apiFormat as any)) {
      supported.push({
        id: generateProviderId(p.name),
        name: p.name,
        type: mapProviderType(p.type),
        apiEndpoint: p.apiEndpoint,
        apiFormat: p.apiFormat,
        models: p.models,
        icon: p.icon,
        iconColor: p.iconColor,
        websiteUrl: p.websiteUrl,
        apiKeyUrl: p.apiKeyUrl,
        isPartner: p.isPartner
      })
    } else {
      unsupported.push({ name: p.name, format: p.apiFormat })
    }
  }
  
  console.log('[Oh My Prompt] Unsupported providers:', unsupported)
  return supported
}

function generateProviderId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function mapProviderType(type: string): Provider['type'] {
  const typeMap: Record<string, Provider['type']> = {
    'official': 'official',
    'cn_official': 'cn_official',
    'aggregator': 'aggregator',
    'third_party': 'third_party',
    'cloud_provider': 'third_party'
  }
  return typeMap[type] || 'third_party'
}
```

### 2.4 Grouping for UI

```typescript
export interface ProviderGroup {
  label: string              // '官方 API' / '国内提供商' / '聚合器' / '第三方'
  labelEn: string            // 'Official' / 'China Providers' / 'Aggregators' / 'Third-party'
  type: Provider['type']
  providers: Provider[]
  order: number
}

export function groupProvidersByType(providers: Provider[]): ProviderGroup[] {
  // Group by type, filter empty groups, sort by order
}
```

---

## 3. UI Architecture

### 3.1 Component Structure

```
src/popup/
├── ApiConfigApp.tsx                # Main entry (refactored)
├── components/
│   ├── ProviderSelect.tsx          # Searchable dropdown with groups
│   ├── ModelSelect.tsx             # Model dropdown
│   ├── ConfigSwitcher.tsx          # Config activation switch
│   ├── ProviderConfigForm.tsx      # Shared form component
│   ├── SavedConfigsList.tsx        # Saved configs display
│   └── ui/
│       ├── tabs.tsx                # Tab component (new)
│       ├── select.tsx              # Select dropdown (new)
│       └── input.tsx, button.tsx, dialog.tsx (existing)
```

### 3.2 Main App Structure

```tsx
function ApiConfigApp() {
  const [activeTab, setActiveTab] = useState<'quick' | 'custom'>('quick')
  const [configs, setConfigs] = useState<ProviderConfig[]>([])
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null)
  
  return (
    <div>
      <header>视觉AI配置</header>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="quick">快速配置</TabsTrigger>
          <TabsTrigger value="custom">自定义配置</TabsTrigger>
        </TabsList>
        
        <TabsContent value="quick">
          <QuickConfigPanel onSave={handleSaveConfig} />
        </TabsContent>
        
        <TabsContent value="custom">
          <CustomConfigPanel onSave={handleSaveConfig} />
        </TabsContent>
      </Tabs>
      
      <SavedConfigsList configs={configs} activeConfigId={activeConfigId} ... />
    </div>
  )
}
```

### 3.3 Quick Config Panel

```tsx
function QuickConfigPanel({ onSave }) {
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [apiKey, setApiKey] = useState('')
  
  // Auto-select first model when provider changes
  useEffect(() => {
    if (selectedProvider?.models.length) {
      setSelectedModel(selectedProvider.models[0])
    }
  }, [selectedProvider])
  
  return (
    <div>
      <ProviderSelect value={selectedProvider} onChange={setSelectedProvider} />
      {selectedProvider && (
        <ModelSelect models={selectedProvider.models} value={selectedModel} onChange={setSelectedModel} />
      )}
      <Input type="password" value={apiKey} onChange={...} placeholder="API Key" />
      {selectedProvider?.apiKeyUrl && <a href={...}>获取 API Key →</a>}
      <Button onClick={onSave}>保存配置</Button>
    </div>
  )
}
```

### 3.4 Custom Config Panel

```tsx
function CustomConfigPanel({ onSave }) {
  const [apiFormat, setApiFormat] = useState<'anthropic_messages' | 'chat_completions'>('chat_completions')
  const [apiEndpoint, setApiEndpoint] = useState('')
  const [modelName, setModelName] = useState('')
  const [apiKey, setApiKey] = useState('')
  
  return (
    <div>
      <Select value={apiFormat} onChange={setApiFormat}>
        <option value="anthropic_messages">Anthropic 格式</option>
        <option value="chat_completions">OpenAI 格式</option>
      </Select>
      <Input value={apiEndpoint} placeholder="https://api.example.com/v1" />
      <Input value={modelName} placeholder="gpt-4o, qwen-vl-max 等" />
      <Input type="password" value={apiKey} placeholder="API Key" />
      <Button onClick={onSave}>保存配置</Button>
    </div>
  )
}
```

### 3.5 Saved Configs List

```tsx
function SavedConfigsList({ configs, activeConfigId, onActivate, onDelete, onEdit }) {
  if (configs.length === 0) return null
  
  return (
    <div>
      <h2>已保存配置</h2>
      {configs.map(config => (
        <ConfigCard
          key={config.id}
          config={config}
          isActive={config.id === activeConfigId}
          onActivate={() => onActivate(config.id)}
          onDelete={() => onDelete(config.id)}
          onEdit={() => onEdit(config)}
        />
      ))}
    </div>
  )
}
```

---

## 4. Service Layer Message Handlers

### 4.1 New MessageTypes

```typescript
// src/shared/messages.ts
export enum MessageType {
  // Provider config management
  GET_PROVIDER_CONFIGS = 'GET_PROVIDER_CONFIGS',
  SET_PROVIDER_CONFIGS = 'SET_PROVIDER_CONFIGS',
  ADD_PROVIDER_CONFIG = 'ADD_PROVIDER_CONFIG',
  UPDATE_PROVIDER_CONFIG = 'UPDATE_PROVIDER_CONFIG',
  DELETE_PROVIDER_CONFIG = 'DELETE_PROVIDER_CONFIG',
  SET_ACTIVE_CONFIG = 'SET_ACTIVE_CONFIG',
  GET_ACTIVE_CONFIG = 'GET_ACTIVE_CONFIG',
  
  // Legacy compatibility
  GET_API_CONFIG = 'GET_API_CONFIG',
  SET_API_CONFIG = 'SET_API_CONFIG',
  DELETE_API_CONFIG = 'DELETE_API_CONFIG'
}
```

### 4.2 Handler Logic

**GET_PROVIDER_CONFIGS:**
- Return `{ configs: ProviderConfig[], activeConfigId: string | null }`
- SECURITY: Mask `apiKey` as `[REDACTED]` in response (UI display only)

**ADD_PROVIDER_CONFIG:**
- Validate required fields
- Generate UUID
- Set `configuredAt`
- If first config, auto-activate
- SECURITY: Never log apiKey

**UPDATE_PROVIDER_CONFIG:**
- Merge update, preserve `id` and `configuredAt`
- Validate before save

**DELETE_PROVIDER_CONFIG:**
- Remove from array
- If deleted config was active, auto-activate first remaining (or null)

**SET_ACTIVE_CONFIG:**
- Validate config exists
- Update `activeConfigId`

**GET_ACTIVE_CONFIG:**
- Return full config (Vision API needs apiKey)
- Use only in trusted contexts (service worker → vision-api.ts)

**Legacy GET_API_CONFIG (compatibility):**
- Return `VisionApiConfig` format for existing Vision code
- Map `apiFormat`: anthropic_messages → 'anthropic', chat_completions → 'openai'

---

## 5. Vision API Adaptation

### 5.1 Active Config Retrieval

```typescript
// src/lib/vision-api.ts
async function getActiveConfig(): Promise<ProviderConfig | null> {
  const response = await chrome.runtime.sendMessage({ 
    type: MessageType.GET_ACTIVE_CONFIG 
  })
  return response.success ? response.data : null
}
```

### 5.2 API Format Mapping

```typescript
function mapApiFormat(format: ProviderConfig['apiFormat']): 'anthropic' | 'openai' {
  return format === 'anthropic_messages' ? 'anthropic' : 'openai'
}
```

### 5.3 executeVisionApiCall Changes

```typescript
export async function executeVisionApiCall(
  imageData: string,
  format: 'url' | 'base64' = 'base64',
  signal?: AbortSignal
): Promise<VisionApiResultData> {
  const config = await getActiveConfig()
  if (!config) throw new Error('NO_CONFIG: 请先配置 Vision API')
  
  // Use config.apiEndpoint, config.selectedModel, config.apiKey
  // Map apiFormat for buildHeaders / buildRequest
}
```

---

## 6. Data Migration

### 6.1 Migration Logic

```typescript
// src/background/service-worker.ts
async function migrateLegacyConfig(): Promise<void> {
  const result = await chrome.storage.local.get([
    LEGACY_VISION_API_CONFIG_KEY,
    PROVIDER_CONFIGS_STORAGE_KEY
  ])
  
  // Skip if new configs exist
  if (result[PROVIDER_CONFIGS_STORAGE_KEY]?.configs?.length > 0) return
  
  // Migrate legacy config
  const legacyConfig = result[LEGACY_VISION_API_CONFIG_KEY]
  if (legacyConfig?.apiKey) {
    const migratedConfig: ProviderConfig = {
      id: crypto.randomUUID(),
      providerId: 'migrated',
      providerName: '迁移的配置',
      apiKey: legacyConfig.apiKey,
      apiEndpoint: legacyConfig.baseUrl,
      apiFormat: legacyConfig.apiFormat === 'anthropic' ? 'anthropic_messages' : 'chat_completions',
      selectedModel: legacyConfig.modelName,
      configuredAt: legacyConfig.configuredAt || Date.now(),
      isCustom: true
    }
    
    await chrome.storage.local.set({
      [PROVIDER_CONFIGS_STORAGE_KEY]: {
        configs: [migratedConfig],
        activeConfigId: migratedConfig.id
      }
    })
  }
}

// Run on install/startup
chrome.runtime.onInstalled.addListener(migrateLegacyConfig)
chrome.runtime.onStartup.addListener(migrateLegacyConfig)
```

### 6.2 Rollback Strategy

- Keep legacy `_visionApiConfig` for 30 days (don't delete immediately)
- Migration sets `isCustom: true` to distinguish migrated configs

---

## 7. Config Validation

```typescript
// src/lib/config-validator.ts
export interface ConfigValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export function validateProviderConfig(config: Partial<ProviderConfig>): ConfigValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  
  // Required fields
  if (!config.apiKey?.trim()) errors.push('API Key 不能为空')
  if (!config.apiEndpoint?.trim()) errors.push('API 地址不能为空')
  else if (!config.apiEndpoint.startsWith('https://')) errors.push('API 地址必须使用 HTTPS')
  if (!config.selectedModel?.trim()) errors.push('模型名称不能为空')
  
  // Format check
  if (config.apiFormat && !['anthropic_messages', 'chat_completions'].includes(config.apiFormat)) {
    errors.push('不支持的 API 格式')
  }
  
  // Warnings
  if (config.providerId === 'custom' && !config.providerName?.trim()) {
    warnings.push('建议为自定义配置设置一个名称')
  }
  
  return { valid: errors.length === 0, errors, warnings }
}
```

---

## 8. Security Considerations

### 8.1 API Key Protection

- Never log `apiKey` in any console.log
- Mask as `[REDACTED]` when returning configs for UI display
- Only return full apiKey in `GET_ACTIVE_CONFIG` (internal use)

### 8.2 HTTPS Enforcement

- Validate `apiEndpoint.startsWith('https://')` before save
- Reject HTTP endpoints with clear error message

### 8.3 Storage Isolation

- Use `chrome.storage.local` (not sync)
- Per-extension isolation by Chrome

---

## 9. Edge Cases

| Case | Handling |
|------|----------|
| User deletes active config | Auto-activate first remaining config (or set null) |
| All configs deleted | Return to onboarding state (no active config) |
| Provider model list changes (version update) | Show updated models on next edit; saved `selectedModel` preserved |
| Legacy config exists during migration | One-time migration on startup; no duplicate |
| Custom config with same endpoint as preset | Allowed; user can have multiple configs for same provider |
| Unsupported provider selected in quick config | Not shown in dropdown (filtered out) |

---

## 10. Scope Boundaries

### In Scope
- Multi-config storage with quick switching
- Provider selection from providers.json (52 supported)
- Tab-based UI: Quick Config / Custom Config
- Data migration from legacy `_visionApiConfig`
- Vision API adaptation to new config structure

### Out of Scope
- Supporting gemini_native, bedrock, openai_chat, openai_responses formats
- Remote provider data updates
- User-customizable provider list
- OAuth-based providers (GitHub Copilot, Codex)
- Multi-account per provider
- Model-specific settings (temperature, max_tokens)

---

## 11. Success Criteria

1. User can select from 52 providers in searchable dropdown
2. User can save multiple API configs
3. User can switch active config with single click
4. Vision API uses active config automatically
5. Legacy configs migrate without data loss
6. No apiKey exposure in logs

---

## 12. Implementation Priority

1. **Data layer:** Storage keys, ProviderConfig interface, provider-data.ts
2. **Service layer:** Message handlers, migration logic
3. **UI layer:** Tabs, ProviderSelect, ModelSelect, SavedConfigsList
4. **Vision adaptation:** getActiveConfig, mapApiFormat, executeVisionApiCall
5. **Testing:** Config CRUD, switching, migration, Vision call with new config