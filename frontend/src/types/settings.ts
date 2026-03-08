export const ProviderOptions = {
  github: "github",
  gitlab: "gitlab",
  bitbucket: "bitbucket",
  bitbucket_data_center: "bitbucket_data_center",
  azure_devops: "azure_devops",
  forgejo: "forgejo",
  enterprise_sso: "enterprise_sso",
} as const;

export type Provider = keyof typeof ProviderOptions;

export type ProviderToken = {
  token: string;
  host: string | null;
};

export type MCPSSEServer = {
  url: string;
  api_key?: string;
};

export type MCPStdioServer = {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

export type MCPSHTTPServer = {
  url: string;
  api_key?: string;
  timeout?: number;
};

export type MCPConfig = {
  sse_servers: (string | MCPSSEServer)[];
  stdio_servers: MCPStdioServer[];
  shttp_servers: (string | MCPSHTTPServer)[];
};

export type SettingsChoice = {
  label: string;
  value: string;
};

export type SettingsFieldSchema = {
  key: string;
  label: string;
  description?: string | null;
  widget: string;
  section: string;
  section_label: string;
  order: number;
  choices: SettingsChoice[];
  depends_on: string[];
  advanced: boolean;
  secret: boolean;
  required: boolean;
  slash_command?: string | null;
};

export type SettingsSectionSchema = {
  key: string;
  label: string;
  order: number;
  fields: SettingsFieldSchema[];
};

export type SettingsSchema = {
  model_name: string;
  sections: SettingsSectionSchema[];
};

export type Settings = {
  llm_model: string;
  llm_base_url: string;
  agent: string;
  language: string;
  llm_api_key: string | null;
  llm_api_key_set: boolean;
  search_api_key_set: boolean;
  confirmation_mode: boolean;
  security_analyzer: string | null;
  remote_runtime_resource_factor: number | null;
  provider_tokens_set: Partial<Record<Provider, string | null>>;
  enable_default_condenser: boolean;
  // Maximum number of events before the condenser runs
  condenser_max_size: number | null;
  enable_sound_notifications: boolean;
  enable_proactive_conversation_starters: boolean;
  enable_solvability_analysis: boolean;
  user_consents_to_analytics: boolean | null;
  search_api_key?: string;
  is_new_user?: boolean;
  mcp_config?: MCPConfig;
  max_budget_per_task: number | null;
  email?: string;
  email_verified?: boolean;
  git_user_name?: string;
  git_user_email?: string;
  v1_enabled?: boolean;
  sdk_settings_schema?: SettingsSchema | null;
};
