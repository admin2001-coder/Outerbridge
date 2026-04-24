/* eslint-disable */
// This catalog helper is generated from tencentcloud-sdk-nodejs 4.1.221.
// Catalog data lives in TencentCloudApiCatalogData.json so TypeScript does not need to parse a 10MB literal on every build.

export type TencentCloudActionParameter = {
    name: string
    type: string
    required?: true
    description?: string
}

export type TencentCloudActionCatalog = {
    name: string
    description?: string
    parameters?: TencentCloudActionParameter[]
}

export type TencentCloudVersionCatalog = {
    name: string
    version: string
    endpoint: string
    actions: TencentCloudActionCatalog[]
}

export type TencentCloudServiceCatalog = {
    name: string
    label: string
    documentationUrl?: string
    changeLogUrl?: string
    updatedAt?: string
    versions: TencentCloudVersionCatalog[]
}

export const TENCENT_CLOUD_CATALOG_SDK_PACKAGE = 'tencentcloud-sdk-nodejs'
export const TENCENT_CLOUD_CATALOG_SDK_VERSION = '4.1.221'
export const TENCENT_CLOUD_CATALOG_SERVICE_COUNT = 251
export const TENCENT_CLOUD_CATALOG_VERSION_COUNT = 287
export const TENCENT_CLOUD_CATALOG_ACTION_COUNT = 13710

const catalogData = require('./TencentCloudApiCatalogData.json') as TencentCloudServiceCatalog[]
export const TENCENT_CLOUD_API_CATALOG: TencentCloudServiceCatalog[] = catalogData

export function findTencentCloudService(serviceName: string): TencentCloudServiceCatalog | undefined {
    return TENCENT_CLOUD_API_CATALOG.find((service) => service.name === serviceName)
}

export function findTencentCloudVersion(serviceName: string, versionName: string): TencentCloudVersionCatalog | undefined {
    const service = findTencentCloudService(serviceName)
    return service?.versions.find((version) => version.name === versionName || version.version === versionName)
}

export function findTencentCloudAction(
    serviceName: string,
    versionName: string,
    actionName: string
): TencentCloudActionCatalog | undefined {
    const version = findTencentCloudVersion(serviceName, versionName)
    return version?.actions.find((action) => action.name === actionName)
}

export function buildTencentCloudActionValue(serviceName: string, versionName: string, actionName: string): string {
    return `${serviceName}|${versionName}|${actionName}`
}

export function parseTencentCloudActionValue(value: string): { serviceName: string; versionName: string; actionName: string } | undefined {
    const parts = value.split('|')
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return undefined
    return { serviceName: parts[0], versionName: parts[1], actionName: parts[2] }
}

export function buildTencentCloudParametersHtml(action: TencentCloudActionCatalog | undefined): string {
    const parameters = action?.parameters || []
    if (!parameters.length) return '<p>This API has no documented request parameters in the Tencent Cloud SDK model.</p>'

    const rows = parameters
        .map((parameter) => {
            const required = parameter.required ? 'Required' : 'Optional'
            const description = parameter.description ? `<div>${escapeHtml(parameter.description)}</div>` : ''
            return `<li><strong>${escapeHtml(parameter.name)}</strong> <code>${escapeHtml(parameter.type)}</code> <em>${required}</em>${description}</li>`
        })
        .join('')

    return `<ul>${rows}</ul>`
}

export function buildTencentCloudExampleParameters(action: TencentCloudActionCatalog | undefined): string {
    const parameters = action?.parameters || []
    const example = parameters.reduce((result, parameter) => {
        if (!parameter.required) return result
        result[parameter.name] = placeholderForType(parameter.type)
        return result
    }, {} as Record<string, unknown>)

    return JSON.stringify(example, null, 2)
}

function placeholderForType(type: string): unknown {
    const normalizedType = (type || '').toLowerCase()
    if (normalizedType.startsWith('array<')) return []
    if (normalizedType === 'array' || normalizedType.endsWith('[]')) return []
    if (normalizedType.includes('number') || normalizedType.includes('integer') || normalizedType.includes('int64') || normalizedType.includes('uint64')) return 0
    if (normalizedType.includes('boolean') || normalizedType.includes('bool')) return false
    if (!normalizedType || normalizedType === 'object' || /^[A-Z]/.test(type)) return {}
    return ''
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}
