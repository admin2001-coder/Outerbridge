import { createHash, createHmac } from 'crypto'
import axios, { AxiosRequestConfig, AxiosRequestHeaders, Method, ResponseType } from 'axios'
import FormData from 'form-data'
import {
    ICommonObject,
    INode,
    INodeData,
    INodeExecutionData,
    INodeOptionsValue,
    INodeParams,
    NodeType
} from '../../src/Interface'
import { handleErrorMessage, returnNodeExecutionData } from '../../src/utils'
import {
    TENCENT_CLOUD_API_CATALOG,
    TENCENT_CLOUD_CATALOG_ACTION_COUNT,
    TENCENT_CLOUD_CATALOG_SDK_VERSION,
    TENCENT_CLOUD_CATALOG_SERVICE_COUNT,
    TENCENT_CLOUD_CATALOG_VERSION_COUNT,
    TencentCloudActionCatalog,
    TencentCloudVersionCatalog,
    buildTencentCloudActionValue,
    buildTencentCloudExampleParameters,
    buildTencentCloudParametersHtml,
    findTencentCloudAction,
    findTencentCloudService,
    findTencentCloudVersion,
    parseTencentCloudActionValue
} from './TencentCloudApiCatalog'

type BodyMode = 'json' | 'form' | 'multipart' | 'raw' | 'none'
type TencentHttpMethod = 'POST' | 'GET'
type TencentCloudOperation = 'callSelectedApi' | 'callCustomApi'

type QueryParamPair = {
    key: string
    value: string
}

type PreparedRequest = {
    data?: any
    payloadForSigning: string | Buffer
    contentType: string
    contentHeaders?: Record<string, string>
}

type TencentSignature = {
    authorization: string
    signedHeaders: string
    canonicalRequest: string
    stringToSign: string
    credentialScope: string
}

type ParsedFile = {
    buffer: Buffer
    filename: string
    contentType: string
}

type ResolvedTencentApi = {
    endpoint: string
    service: string
    action: string
    version: string
    versionName?: string
    catalogAction?: TencentCloudActionCatalog
    catalogVersion?: TencentCloudVersionCatalog
}

const DEFAULT_CONTENT_TYPE = 'application/json; charset=utf-8'
const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded'
const ALGORITHM = 'TC3-HMAC-SHA256'
const DEFAULT_SELECTED_SERVICE = 'cvm'
const DEFAULT_SELECTED_VERSION = 'v20170312'
const DEFAULT_SELECTED_ACTION = buildTencentCloudActionValue(DEFAULT_SELECTED_SERVICE, DEFAULT_SELECTED_VERSION, 'DescribeInstances')

class TencentCloud implements INode {
    label: string
    name: string
    type: NodeType
    description: string
    version: number
    icon: string
    category: string
    incoming: number
    outgoing: number
    actions?: INodeParams[]
    credentials?: INodeParams[]
    inputParameters?: INodeParams[]

    constructor() {
        this.label = 'Tencent Cloud'
        this.name = 'tencentCloud'
        this.icon = 'tencentcloud.svg'
        this.type = 'action'
        this.category = 'Cloud'
        this.version = 2.0
        this.description = `Call Tencent Cloud API 3.0 methods with a generated selectable catalog (${TENCENT_CLOUD_CATALOG_SERVICE_COUNT} services, ${TENCENT_CLOUD_CATALOG_VERSION_COUNT} versions, ${TENCENT_CLOUD_CATALOG_ACTION_COUNT} API methods).`
        this.incoming = 1
        this.outgoing = 1
        this.actions = [
            {
                label: 'Operation Mode',
                name: 'operationMode',
                type: 'options',
                options: [
                    {
                        label: 'Call Selected Tencent Cloud API Operation',
                        name: 'callSelectedApi',
                        description: 'Select a Tencent Cloud product, API version, and API operation/method from the generated Tencent Cloud SDK catalog.'
                    },
                    {
                        label: 'Call Custom Tencent Cloud API Operation',
                        name: 'callCustomApi',
                        description: 'Use endpoint, service, version, and action fields directly. Use this when an API exists outside the generated catalog or needs a custom endpoint.'
                    }
                ],
                default: 'callSelectedApi'
            },
            {
                label: 'Service / Product',
                name: 'serviceName',
                type: 'asyncOptions',
                loadMethod: 'getTencentCloudServices',
                default: DEFAULT_SELECTED_SERVICE,
                description: `Tencent Cloud product selector generated from tencentcloud-sdk-nodejs ${TENCENT_CLOUD_CATALOG_SDK_VERSION}.`,
                show: {
                    'actions.operationMode': ['callSelectedApi']
                }
            },
            {
                label: 'API Version',
                name: 'apiVersion',
                type: 'asyncOptions',
                loadMethod: 'getTencentCloudVersions',
                default: DEFAULT_SELECTED_VERSION,
                description: 'Select the API version for the chosen Tencent Cloud service.',
                show: {
                    'actions.operationMode': ['callSelectedApi']
                }
            },
            {
                label: 'API Operation / Method',
                name: 'apiAction',
                type: 'asyncOptions',
                loadMethod: 'getTencentCloudActions',
                default: DEFAULT_SELECTED_ACTION,
                description: 'Select the Tencent Cloud API operation/action to execute. Selecting an operation shows documented request parameters and a required-field example below the selector.',
                show: {
                    'actions.operationMode': ['callSelectedApi']
                }
            },
            {
                label: 'Endpoint Override',
                name: 'endpointOverride',
                type: 'string',
                default: '',
                placeholder: 'cvm.tencentcloudapi.com',
                optional: true,
                description: 'Optional. Leave blank to use the endpoint from the selected Tencent Cloud API catalog entry. Use this for intl/custom endpoints when needed.',
                show: {
                    'actions.operationMode': ['callSelectedApi']
                }
            }
        ] as INodeParams[]
        this.credentials = [
            {
                label: 'Credential Method',
                name: 'credentialMethod',
                type: 'options',
                options: [
                    {
                        label: 'Tencent Cloud API Key',
                        name: 'tencentCloudApi'
                    }
                ],
                default: 'tencentCloudApi'
            }
        ] as INodeParams[]
        this.inputParameters = [
            {
                label: 'Endpoint',
                name: 'endpoint',
                type: 'string',
                default: 'cvm.tencentcloudapi.com',
                placeholder: 'cvm.tencentcloudapi.com',
                description: 'Tencent Cloud API endpoint. Use the product endpoint from Tencent Cloud API docs, for example cvm.tencentcloudapi.com.',
                show: {
                    'actions.operationMode': ['callCustomApi']
                }
            },
            {
                label: 'Service',
                name: 'service',
                type: 'string',
                default: 'cvm',
                placeholder: 'cvm',
                description: 'Tencent Cloud service name used in the signature credential scope. Usually the endpoint prefix, for example cvm for cvm.tencentcloudapi.com.',
                show: {
                    'actions.operationMode': ['callCustomApi']
                }
            },
            {
                label: 'Action',
                name: 'action',
                type: 'string',
                default: 'DescribeInstances',
                placeholder: 'DescribeInstances',
                description: 'Tencent Cloud API action name, for example DescribeInstances.',
                show: {
                    'actions.operationMode': ['callCustomApi']
                }
            },
            {
                label: 'Version',
                name: 'version',
                type: 'string',
                default: '2017-03-12',
                placeholder: '2017-03-12',
                description: 'API version for the selected service/action.',
                show: {
                    'actions.operationMode': ['callCustomApi']
                }
            },
            {
                label: 'Region',
                name: 'region',
                type: 'string',
                default: '',
                placeholder: 'ap-guangzhou',
                optional: true,
                description: 'Tencent Cloud region. Leave blank for APIs that do not use X-TC-Region.'
            },
            {
                label: 'HTTP Method',
                name: 'httpMethod',
                type: 'options',
                options: [
                    {
                        label: 'POST',
                        name: 'POST'
                    },
                    {
                        label: 'GET',
                        name: 'GET'
                    }
                ],
                default: 'POST',
                description: 'POST JSON is the default for Tencent Cloud API 3.0. GET is supported for form-urlencoded requests.'
            },
            {
                label: 'Body Mode',
                name: 'bodyMode',
                type: 'options',
                options: [
                    {
                        label: 'JSON',
                        name: 'json'
                    },
                    {
                        label: 'Form URL Encoded',
                        name: 'form'
                    },
                    {
                        label: 'Multipart Form Data',
                        name: 'multipart'
                    },
                    {
                        label: 'Raw String',
                        name: 'raw'
                    },
                    {
                        label: 'No Body',
                        name: 'none'
                    }
                ],
                default: 'json',
                description: 'How action parameters should be sent and signed.'
            },
            {
                label: 'Request Parameters',
                name: 'parameters',
                type: 'json',
                default: '{}',
                placeholder: '{"Limit": 1}',
                description: 'Action-specific request parameters. JSON mode sends this object as the JSON request body. GET mode sends it as query parameters.',
                show: {
                    'inputParameters.bodyMode': ['json', 'form']
                }
            },
            {
                label: 'Raw Body',
                name: 'rawBody',
                type: 'string',
                default: '',
                rows: 8,
                optional: true,
                description: 'Raw request body string. It is signed exactly as entered.',
                show: {
                    'inputParameters.bodyMode': ['raw']
                }
            },
            {
                label: 'Raw Body Content Type',
                name: 'rawContentType',
                type: 'string',
                default: DEFAULT_CONTENT_TYPE,
                optional: true,
                description: 'Content-Type header for Raw String mode.',
                show: {
                    'inputParameters.bodyMode': ['raw']
                }
            },
            {
                label: 'Multipart Fields',
                name: 'multipartFields',
                type: 'array',
                optional: true,
                description: 'Multipart fields. If File is provided it is sent as a file part; otherwise Value is sent as a string part.',
                show: {
                    'inputParameters.bodyMode': ['multipart']
                },
                array: [
                    {
                        label: 'Key',
                        name: 'key',
                        type: 'string',
                        default: ''
                    },
                    {
                        label: 'Value',
                        name: 'value',
                        type: 'string',
                        default: '',
                        optional: true
                    },
                    {
                        label: 'File',
                        name: 'file',
                        type: 'file',
                        optional: true,
                        description: 'Optional file content. When set, it overrides Value for this multipart field.'
                    },
                    {
                        label: 'Filename',
                        name: 'filename',
                        type: 'string',
                        default: '',
                        optional: true
                    },
                    {
                        label: 'Content Type',
                        name: 'contentType',
                        type: 'string',
                        default: '',
                        optional: true
                    }
                ]
            },
            {
                label: 'URL Query Params',
                name: 'queryParams',
                type: 'array',
                optional: true,
                description: 'Additional URL query parameters. In GET mode these are merged with Request Parameters. In POST mode they remain in the URL and are included in the signature canonical query string.',
                array: [
                    {
                        label: 'Key',
                        name: 'key',
                        type: 'string',
                        default: ''
                    },
                    {
                        label: 'Value',
                        name: 'value',
                        type: 'string',
                        default: ''
                    }
                ]
            },
            {
                label: 'Extra Headers',
                name: 'headers',
                type: 'array',
                optional: true,
                description: 'Optional extra headers. Authentication, X-TC-* common headers, Host, and Content-Type are generated automatically.',
                array: [
                    {
                        label: 'Key',
                        name: 'key',
                        type: 'string',
                        default: ''
                    },
                    {
                        label: 'Value',
                        name: 'value',
                        type: 'string',
                        default: ''
                    }
                ]
            },
            {
                label: 'Language',
                name: 'language',
                type: 'options',
                options: [
                    {
                        label: 'Default',
                        name: ''
                    },
                    {
                        label: 'English',
                        name: 'en-US'
                    },
                    {
                        label: 'Chinese',
                        name: 'zh-CN'
                    }
                ],
                default: '',
                optional: true,
                description: 'Optional X-TC-Language header.'
            },
            {
                label: 'Timestamp Override',
                name: 'timestamp',
                type: 'number',
                default: '',
                optional: true,
                description: 'Optional UNIX timestamp in seconds. Leave blank to use the current time.'
            },
            {
                label: 'Response Type',
                name: 'responseType',
                type: 'options',
                options: [
                    {
                        label: 'JSON',
                        name: 'json'
                    },
                    {
                        label: 'Text',
                        name: 'text'
                    },
                    {
                        label: 'Array Buffer',
                        name: 'arraybuffer'
                    },
                    {
                        label: 'Raw (Base64)',
                        name: 'base64'
                    }
                ],
                default: 'json',
                optional: true
            },
            {
                label: 'Fail On Tencent API Error',
                name: 'failOnTencentError',
                type: 'boolean',
                default: true,
                optional: true,
                description: 'When enabled, a Tencent Cloud Response.Error object causes the node to fail.'
            }
        ] as INodeParams[]
    }

    loadMethods = {
        async getTencentCloudServices(): Promise<INodeOptionsValue[]> {
            return TENCENT_CLOUD_API_CATALOG.map((service) => {
                const actionCount = service.versions.reduce((total, version) => total + version.actions.length, 0)
                const versionList = service.versions.map((version) => version.version).join(', ')
                const label = service.label && service.label !== service.name.toUpperCase() ? `${service.name} — ${service.label}` : service.name
                const descriptionParts = [`${service.versions.length} API version(s)`, `${actionCount} API method(s)`, `Versions: ${versionList}`]
                if (service.updatedAt) descriptionParts.push(`Catalog updated: ${service.updatedAt}`)

                return {
                    label,
                    name: service.name,
                    description: descriptionParts.join(' • ')
                }
            })
        },

        async getTencentCloudVersions(nodeData: INodeData): Promise<INodeOptionsValue[]> {
            const actions = nodeData.actions || {}
            const legacyInput = nodeData.inputParameters || {}
            const serviceName = asTrimmedString(actions.serviceName || legacyInput.serviceName) || DEFAULT_SELECTED_SERVICE
            const service = findTencentCloudService(serviceName) || findTencentCloudService(DEFAULT_SELECTED_SERVICE)

            if (!service) return []

            return service.versions.map((version) => ({
                label: `${version.version} (${version.name})`,
                name: version.name,
                description: `Endpoint: ${version.endpoint} • ${version.actions.length} API method(s)`
            }))
        },

        async getTencentCloudActions(nodeData: INodeData): Promise<INodeOptionsValue[]> {
            const actionsData = nodeData.actions || {}
            const legacyInput = nodeData.inputParameters || {}
            const rawSelectedAction = asTrimmedString(actionsData.apiAction || legacyInput.apiAction)
            const parsedAction = parseTencentCloudActionValue(rawSelectedAction)
            const serviceName = asTrimmedString(actionsData.serviceName || legacyInput.serviceName) || parsedAction?.serviceName || DEFAULT_SELECTED_SERVICE
            const service = findTencentCloudService(serviceName) || findTencentCloudService(DEFAULT_SELECTED_SERVICE)
            const requestedVersionName =
                asTrimmedString(actionsData.apiVersion || legacyInput.apiVersion) || parsedAction?.versionName || service?.versions[0]?.name || DEFAULT_SELECTED_VERSION
            const version =
                service?.versions.find((apiVersion) => apiVersion.name === requestedVersionName || apiVersion.version === requestedVersionName) ||
                service?.versions[0]
            const selectedActionValue =
                rawSelectedAction ||
                buildTencentCloudActionValue(service?.name || DEFAULT_SELECTED_SERVICE, version?.name || DEFAULT_SELECTED_VERSION, version?.actions[0]?.name || 'DescribeInstances')

            if (!service || !version) return []

            return version.actions.map((action) => {
                const value = buildTencentCloudActionValue(service.name, version.name, action.name)
                const option: INodeOptionsValue = {
                    label: action.name,
                    name: value,
                    description: action.description || `${service.name} ${version.version} ${action.name}`
                }

                if (selectedActionValue === value) {
                    option.inputParameters = buildTencentCloudParametersHtml(action)
                    option.exampleParameters = buildTencentCloudExampleParameters(action)
                }

                return option
            })
        }
    }

    async run(nodeData: INodeData): Promise<INodeExecutionData[] | null> {
        const inputParametersData = nodeData.inputParameters
        const credentials = nodeData.credentials
        const actionsData = nodeData.actions

        if (inputParametersData === undefined || actionsData === undefined) {
            throw new Error('Required data missing')
        }

        if (credentials === undefined) {
            throw new Error('Missing credential')
        }

        let operation = ((asTrimmedString(actionsData.operationMode || actionsData.operation) || 'callSelectedApi') as TencentCloudOperation | 'callApi') || 'callSelectedApi'
        if (operation === 'callApi') operation = 'callCustomApi'
        if (operation !== 'callSelectedApi' && operation !== 'callCustomApi') {
            throw new Error(`Unsupported Tencent Cloud operation mode: ${operation}`)
        }

        const secretId = asTrimmedString(credentials.secretId)
        const secretKey = asTrimmedString(credentials.secretKey)
        const token = asTrimmedString(credentials.token)

        if (!secretId || !secretKey) {
            throw new Error('Tencent Cloud Secret ID and Secret Key are required')
        }

        const resolvedApi = resolveTencentApi(operation, actionsData, inputParametersData)
        const endpointUrl = normalizeTencentEndpoint(resolvedApi.endpoint)
        const service = resolvedApi.service.toLowerCase()
        const action = resolvedApi.action
        const apiVersion = resolvedApi.version
        const region = asTrimmedString(inputParametersData.region)
        const language = asTrimmedString(inputParametersData.language)
        const httpMethod = ((asTrimmedString(inputParametersData.httpMethod) || 'POST').toUpperCase() as TencentHttpMethod) || 'POST'
        const bodyMode = ((asTrimmedString(inputParametersData.bodyMode) || 'json') as BodyMode) || 'json'
        const responseType = asTrimmedString(inputParametersData.responseType) || 'json'
        const failOnTencentError = inputParametersData.failOnTencentError !== false
        const timestamp = getTimestamp(inputParametersData.timestamp)

        if (!action) {
            throw new Error('Tencent Cloud Action is required')
        }

        if (!apiVersion) {
            throw new Error('Tencent Cloud API Version is required')
        }

        if (httpMethod !== 'POST' && httpMethod !== 'GET') {
            throw new Error('Tencent Cloud HTTP Method must be POST or GET')
        }

        const parameters = parseJsonObject(inputParametersData.parameters, 'Request Parameters')
        const queryPairs = readKeyValuePairs(inputParametersData.queryParams as ICommonObject[])
        const endpointQueryPairs = readUrlQueryPairs(endpointUrl)
        endpointUrl.search = ''

        if (httpMethod === 'GET') {
            queryPairs.push(...objectToQueryPairs(parameters))
        }

        const allQueryPairs = [...endpointQueryPairs, ...queryPairs]
        const canonicalQueryString = canonicalizeQueryPairs(allQueryPairs)
        const requestUrl = buildRequestUrl(endpointUrl, canonicalQueryString)
        const preparedRequest = prepareRequest(bodyMode, httpMethod, parameters, inputParametersData)
        const contentType = preparedRequest.contentType

        const signature = signTencentCloudRequest({
            method: httpMethod,
            canonicalUri: endpointUrl.pathname || '/',
            canonicalQueryString,
            host: endpointUrl.hostname,
            contentType,
            payload: preparedRequest.payloadForSigning,
            secretId,
            secretKey,
            service,
            timestamp
        })

        const headers: AxiosRequestHeaders = {
            ...readHeaders(inputParametersData.headers as ICommonObject[]),
            ...(preparedRequest.contentHeaders || {}),
            Authorization: signature.authorization,
            'Content-Type': contentType,
            Host: endpointUrl.hostname,
            'X-TC-Action': action,
            'X-TC-Timestamp': timestamp.toString(),
            'X-TC-Version': apiVersion
        }

        if (region) headers['X-TC-Region'] = region
        if (token) headers['X-TC-Token'] = token
        if (language) headers['X-TC-Language'] = language

        const axiosConfig: AxiosRequestConfig = {
            method: httpMethod as Method,
            url: requestUrl,
            headers,
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        }

        if (httpMethod !== 'GET' && typeof preparedRequest.data !== 'undefined') {
            axiosConfig.data = preparedRequest.data
        }

        if (responseType) {
            axiosConfig.responseType = responseType === 'base64' ? 'arraybuffer' : (responseType as ResponseType)
        }

        const returnData: ICommonObject = {}

        try {
            const response = await axios(axiosConfig)

            if (responseType === 'base64') {
                const contentTypeHeader = response.headers['content-type'] || 'application/octet-stream'
                const content = `data:${contentTypeHeader};base64,${Buffer.from(response.data).toString('base64')}`
                returnData.data = content
                returnData.attachments = [
                    {
                        contentType: contentTypeHeader,
                        size: response.headers['content-length'],
                        content
                    }
                ]
            } else {
                returnData.data = response.data
            }

            returnData.status = response.status
            returnData.statusText = response.statusText
            returnData.headers = response.headers
            returnData.request = {
                endpoint: endpointUrl.hostname,
                service,
                action,
                version: apiVersion,
                versionName: resolvedApi.versionName,
                region,
                method: httpMethod,
                bodyMode,
                selectedFromCatalog: operation === 'callSelectedApi',
                catalogSdkVersion: operation === 'callSelectedApi' ? TENCENT_CLOUD_CATALOG_SDK_VERSION : undefined,
                signedHeaders: signature.signedHeaders,
                credentialScope: signature.credentialScope,
                timestamp
            }

            if (failOnTencentError) {
                const tencentError = getTencentError(response.data)
                if (tencentError) {
                    throw new Error(`Tencent Cloud API Error${tencentError.code ? ` (${tencentError.code})` : ''}: ${tencentError.message}`)
                }
            }
        } catch (error) {
            throw handleErrorMessage(error)
        }

        return returnNodeExecutionData(returnData)
    }
}

function resolveTencentApi(operation: TencentCloudOperation, actionsData: ICommonObject, inputParametersData: ICommonObject): ResolvedTencentApi {
    if (operation === 'callCustomApi') {
        const endpointInput = asTrimmedString(inputParametersData.endpoint) || 'cvm.tencentcloudapi.com'
        const endpointUrl = normalizeTencentEndpoint(endpointInput)
        const service = (asTrimmedString(inputParametersData.service) || endpointUrl.hostname.split('.')[0]).toLowerCase()
        return {
            endpoint: endpointInput,
            service,
            action: asTrimmedString(inputParametersData.action),
            version: asTrimmedString(inputParametersData.version)
        }
    }

    const selectedActionValue = asTrimmedString(actionsData.apiAction || inputParametersData.apiAction)
    const parsedAction = parseTencentCloudActionValue(selectedActionValue)

    if (!parsedAction) {
        throw new Error('Please select a Tencent Cloud API Method from the catalog')
    }

    const catalogVersion = findTencentCloudVersion(parsedAction.serviceName, parsedAction.versionName)
    const catalogAction = findTencentCloudAction(parsedAction.serviceName, parsedAction.versionName, parsedAction.actionName)

    if (!catalogVersion || !catalogAction) {
        throw new Error('Selected Tencent Cloud API Method was not found in the generated catalog')
    }

    return {
        endpoint: asTrimmedString(actionsData.endpointOverride || inputParametersData.endpointOverride) || catalogVersion.endpoint,
        service: parsedAction.serviceName,
        action: parsedAction.actionName,
        version: catalogVersion.version,
        versionName: catalogVersion.name,
        catalogAction,
        catalogVersion
    }
}

function normalizeTencentEndpoint(endpoint: string): URL {
    const normalizedEndpoint = endpoint.match(/^https?:\/\//i) ? endpoint : `https://${endpoint}`
    const url = new URL(normalizedEndpoint)

    if (url.protocol !== 'https:') {
        throw new Error('Tencent Cloud API endpoint must use HTTPS')
    }

    const hostname = url.hostname.toLowerCase()
    if (hostname !== 'tencentcloudapi.com' && !hostname.endsWith('.tencentcloudapi.com')) {
        throw new Error('Endpoint must be an official Tencent Cloud API host ending in tencentcloudapi.com')
    }

    url.hostname = hostname
    if (!url.pathname) url.pathname = '/'
    return url
}

function buildRequestUrl(endpointUrl: URL, canonicalQueryString: string): string {
    const url = new URL(endpointUrl.toString())
    url.search = canonicalQueryString ? `?${canonicalQueryString}` : ''
    return url.toString()
}

function prepareRequest(
    bodyMode: BodyMode,
    httpMethod: TencentHttpMethod,
    parameters: Record<string, any>,
    inputParametersData: ICommonObject
): PreparedRequest {
    if (httpMethod === 'GET') {
        return {
            payloadForSigning: '',
            contentType: FORM_CONTENT_TYPE
        }
    }

    if (bodyMode === 'none') {
        return {
            payloadForSigning: '',
            contentType: DEFAULT_CONTENT_TYPE
        }
    }

    if (bodyMode === 'form') {
        const payload = canonicalizeQueryPairs(objectToQueryPairs(parameters))
        return {
            data: payload,
            payloadForSigning: payload,
            contentType: FORM_CONTENT_TYPE
        }
    }

    if (bodyMode === 'raw') {
        const rawPayload = asString(inputParametersData.rawBody)
        const contentType = asTrimmedString(inputParametersData.rawContentType) || DEFAULT_CONTENT_TYPE
        return {
            data: rawPayload,
            payloadForSigning: rawPayload,
            contentType
        }
    }

    if (bodyMode === 'multipart') {
        return prepareMultipartRequest(inputParametersData.multipartFields as ICommonObject[])
    }

    const payload = JSON.stringify(parameters || {})
    return {
        data: payload,
        payloadForSigning: payload,
        contentType: DEFAULT_CONTENT_TYPE
    }
}

function prepareMultipartRequest(multipartFields: ICommonObject[] | undefined): PreparedRequest {
    const formData = new FormData()
    const fields = Array.isArray(multipartFields) ? multipartFields : []

    for (const field of fields) {
        const key = asTrimmedString(field.key)
        if (!key) continue

        const file = asString(field.file)
        if (file) {
            const parsedFile = parseFileDataUri(file, asTrimmedString(field.filename), asTrimmedString(field.contentType))
            formData.append(key, parsedFile.buffer, {
                filename: parsedFile.filename,
                contentType: parsedFile.contentType
            })
        } else {
            formData.append(key, asString(field.value))
        }
    }

    const contentHeaders = normalizeHeaderRecord(formData.getHeaders())
    const contentType = contentHeaders['content-type'] || contentHeaders['Content-Type'] || 'multipart/form-data'
    delete contentHeaders['content-type']
    delete contentHeaders['Content-Type']
    const payload = formData.getBuffer()

    return {
        data: payload,
        payloadForSigning: payload,
        contentType,
        contentHeaders
    }
}

function parseFileDataUri(fileValue: string, fallbackFilename?: string, fallbackContentType?: string): ParsedFile {
    const segments = fileValue.split(',')
    const metadata = segments[0] || ''
    const encodedContent = segments[1] || ''
    const filenameSegment = segments.find((segment) => segment.startsWith('filename:') || segment.startsWith('filepath:'))
    const filenameFromData = filenameSegment ? filenameSegment.split(':').slice(1).join(':').split('/').pop() : ''
    const contentTypeFromData = metadata.startsWith('data:') ? metadata.substring(5).split(';')[0] : ''
    const isBase64 = metadata.includes(';base64')

    return {
        buffer: isBase64 ? Buffer.from(encodedContent, 'base64') : Buffer.from(decodeURIComponent(encodedContent), 'utf8'),
        filename: fallbackFilename || filenameFromData || 'file',
        contentType: fallbackContentType || contentTypeFromData || 'application/octet-stream'
    }
}

function signTencentCloudRequest(input: {
    method: TencentHttpMethod
    canonicalUri: string
    canonicalQueryString: string
    host: string
    contentType: string
    payload: string | Buffer
    secretId: string
    secretKey: string
    service: string
    timestamp: number
}): TencentSignature {
    const date = new Date(input.timestamp * 1000).toISOString().slice(0, 10)
    const canonicalHeaders = `content-type:${input.contentType.trim().toLowerCase()}\nhost:${input.host.trim().toLowerCase()}\n`
    const signedHeaders = 'content-type;host'
    const hashedRequestPayload = sha256(input.payload)
    const canonicalRequest = [
        input.method,
        input.canonicalUri || '/',
        input.canonicalQueryString,
        canonicalHeaders,
        signedHeaders,
        hashedRequestPayload
    ].join('\n')

    const credentialScope = `${date}/${input.service}/tc3_request`
    const stringToSign = [ALGORITHM, input.timestamp.toString(), credentialScope, sha256(canonicalRequest)].join('\n')
    const secretDate = hmac(`TC3${input.secretKey}`, date)
    const secretService = hmac(secretDate, input.service)
    const secretSigning = hmac(secretService, 'tc3_request')
    const signature = hmac(secretSigning, stringToSign).toString('hex')
    const authorization = `${ALGORITHM} Credential=${input.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

    return {
        authorization,
        signedHeaders,
        canonicalRequest,
        stringToSign,
        credentialScope
    }
}

function getTencentError(data: any): { code?: string; message: string } | undefined {
    const response = data && typeof data === 'object' ? data.Response : undefined
    const error = response && typeof response === 'object' ? response.Error : undefined
    if (!error || typeof error !== 'object') return undefined

    return {
        code: typeof error.Code === 'string' ? error.Code : undefined,
        message: typeof error.Message === 'string' ? error.Message : JSON.stringify(error)
    }
}

function parseJsonObject(value: any, fieldName: string): Record<string, any> {
    if (value === undefined || value === null || value === '') return {}
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value)
            if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error(`${fieldName} must be a JSON object`)
            }
            return parsed as Record<string, any>
        } catch (error) {
            throw new Error(`${fieldName} contains invalid JSON: ${(error as Error).message}`)
        }
    }
    if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>

    throw new Error(`${fieldName} must be a JSON object`)
}

function objectToQueryPairs(parameters: Record<string, any>): QueryParamPair[] {
    const pairs: QueryParamPair[] = []

    for (const key of Object.keys(parameters || {})) {
        const value = parameters[key]
        appendQueryPair(pairs, key, value)
    }

    return pairs
}

function appendQueryPair(pairs: QueryParamPair[], key: string, value: any): void {
    if (value === undefined || value === null) return

    if (Array.isArray(value)) {
        value.forEach((item, index) => appendQueryPair(pairs, `${key}.${index}`, item))
        return
    }

    if (typeof value === 'object') {
        for (const childKey of Object.keys(value)) {
            appendQueryPair(pairs, `${key}.${childKey}`, value[childKey])
        }
        return
    }

    pairs.push({ key, value: String(value) })
}

function readKeyValuePairs(items: ICommonObject[] | undefined): QueryParamPair[] {
    const pairs: QueryParamPair[] = []
    if (!Array.isArray(items)) return pairs

    for (const item of items) {
        const key = asTrimmedString(item.key)
        if (!key) continue
        pairs.push({ key, value: asString(item.value) })
    }

    return pairs
}

function readUrlQueryPairs(url: URL): QueryParamPair[] {
    const pairs: QueryParamPair[] = []
    url.searchParams.forEach((value, key) => pairs.push({ key, value }))
    return pairs
}

function canonicalizeQueryPairs(pairs: QueryParamPair[]): string {
    return [...pairs]
        .sort((a, b) => {
            if (a.key === b.key) return a.value.localeCompare(b.value)
            return a.key.localeCompare(b.key)
        })
        .map((pair) => `${encodeRFC3986(pair.key)}=${encodeRFC3986(pair.value)}`)
        .join('&')
}

function readHeaders(items: ICommonObject[] | undefined): Record<string, string> {
    const headers: Record<string, string> = {}
    if (!Array.isArray(items)) return headers

    const generatedHeaderNames = [
        'authorization',
        'content-type',
        'host',
        'x-tc-action',
        'x-tc-timestamp',
        'x-tc-token',
        'x-tc-version',
        'x-tc-region',
        'x-tc-language'
    ]

    for (const item of items) {
        const key = asTrimmedString(item.key)
        if (!key || generatedHeaderNames.includes(key.toLowerCase())) continue
        headers[key] = asString(item.value)
    }

    return headers
}

function normalizeHeaderRecord(headers: Record<string, any>): Record<string, string> {
    const normalized: Record<string, string> = {}
    for (const key of Object.keys(headers || {})) {
        normalized[key] = String(headers[key])
    }
    return normalized
}

function getTimestamp(value: any): number {
    const valueString = asTrimmedString(value)
    if (!valueString) return Math.floor(Date.now() / 1000)

    const timestamp = Number(valueString)
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        throw new Error('Timestamp Override must be a positive UNIX timestamp in seconds')
    }
    return Math.floor(timestamp)
}

function sha256(payload: string | Buffer): string {
    return createHash('sha256').update(payload).digest('hex')
}

function hmac(key: string | Buffer, message: string): Buffer {
    return createHmac('sha256', key).update(message, 'utf8').digest()
}

function encodeRFC3986(value: string): string {
    return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
}

function asString(value: any): string {
    if (value === undefined || value === null) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
}

function asTrimmedString(value: any): string {
    return asString(value).trim()
}

module.exports = { nodeClass: TencentCloud }
