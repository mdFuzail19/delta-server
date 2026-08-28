import { EnvConfig } from '../utils/helpers'

export const Table = {
    getAppReleases: () => EnvConfig.getTableName(),
}

export enum ReleaseState {
    CREATED = 0,
    STAGING = 10, //Only Available to internal users
    LIVE = 20, //Available to users
    DISABLED = 30, //Disabled for updates, can be moved to live again
    DELETED = 40, //Invalid or Corrupted build, cannot be moved to live again
    HALTED = 25, // Halted for updates, can be moved to live again
}

export interface AppReleaseItem {
    AppId: string
    ReleaseVersion: string
    JsVersion: number
    BundleVersion: number
    ReleaseState: ReleaseState
    Rollout: number
    Bundle: { url: string }
    Hash: string
    Patches: Record<string, { url: string }> | null
    CreatedAt: string
    UpdatedAt: string
    AppVersion?: string
    NativeRelease: boolean
    DefaultRelease: boolean
    IsMandatory: boolean
    Description: string
}

export interface AppRegistryItem {
    AppId: string
    ReleaseVersion: string
    AppName: string
    Platform: 'android' | 'iOS'
    IsEnabled: boolean
    CreatedAt: string
    UpdatedAt: string
}

export const ReleaseStateUpdateMapper: Record<ReleaseState, Array<ReleaseState>> = {
    [ReleaseState.CREATED]: [ReleaseState.STAGING, ReleaseState.DISABLED, ReleaseState.DELETED],
    [ReleaseState.STAGING]: [ReleaseState.LIVE, ReleaseState.DISABLED, ReleaseState.DELETED, ReleaseState.HALTED],
    [ReleaseState.LIVE]: [ReleaseState.DISABLED, ReleaseState.DELETED, ReleaseState.HALTED],
    [ReleaseState.DISABLED]: [ReleaseState.DELETED],
    [ReleaseState.DELETED]: [],
    [ReleaseState.HALTED]: [ReleaseState.LIVE, ReleaseState.DISABLED, ReleaseState.DELETED],
}

export const AllowedReleaseStatesForNativeRelease: Array<ReleaseState> = [
    ReleaseState.CREATED,
    ReleaseState.STAGING,
    ReleaseState.LIVE,
]

export enum CacheInvalidationType {
    ALL = 'ALL',
    CHECK_UPDATE = 'CHECK_UPDATE',
    GET_REGISTRY = 'GET_REGISTRY',
    RELEASE_LIST = 'RELEASE_LIST', // code push
}
