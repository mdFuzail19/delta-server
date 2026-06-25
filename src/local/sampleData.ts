export const sampleAppReleasesData = [
    {
        AppId: 'sampleAppAndroid',
        ReleaseVersion: '0100-00',
        JsVersion: 100,
        BundleVersion: 0,
        Rollout: 50,
        Bundle: {
            url: 'YOUR_SAMPLE_URL',
        },
        Hash: 'SOME_SAMPLE_HASH',
        Patches: null,
        ReleaseState: 0,
    },
    {
        AppId: 'sampleAppAndroid',
        ReleaseVersion: '0099-00',
        JsVersion: 99,
        BundleVersion: 0,
        Rollout: 100,
        Bundle: {
            url: 'YOUR_SAMPLE_URL',
        },
        Hash: 'SOME_SAMPLE_HASH',
        Patches: null,
        ReleaseState: 10,
    },
    {
        AppId: 'sampleAppAndroid',
        ReleaseVersion: '0099-01',
        JsVersion: 99,
        BundleVersion: 1,
        Rollout: 100,
        Bundle: {
            url: 'YOUR_SAMPLE_URL',
        },
        Hash: 'SOME_SAMPLE_HASH',
        Patches: {
            'Patch-01-00': {
                url: 'YOUR_SAMPLE_URL',
            },
        },
        ReleaseState: 20,
    },
    {
        AppId: 'sampleAppAndroid',
        ReleaseVersion: '0099-02',
        JsVersion: 99,
        BundleVersion: 2,
        Rollout: 70,
        Bundle: {
            url: 'YOUR_SAMPLE_URL',
        },
        Hash: 'SOME_SAMPLE_HASH',
        Patches: {
            'Patch-02-00': {
                url: 'YOUR_SAMPLE_URL',
                size: 2020,
            },
            'Patch-02-01': {
                url: 'YOUR_SAMPLE_URL',
                size: 2030,
            },
        },
        ReleaseState: 10,
    },
    {
        AppId: 'sampleAppIos',
        ReleaseVersion: '0099-00',
        JsVersion: 99,
        BundleVersion: 0,
        Rollout: 10,
        Bundle: {
            url: 'YOUR_SAMPLE_URL',
        },
        Hash: 'SOME_SAMPLE_HASH',
        Patches: null,
        ReleaseState: 0,
    },
]

export const sampleAppRegistryData = [
    {
        AppId: 'sampleAppIOS',
        ReleaseVersion: '0000-00',
        AppName: 'Sample App iOS',
        Platform: 'iOS',
        IsEnabled: true,
    },
    {
        AppId: 'sampleAppAndroid',
        ReleaseVersion: '0000-00',
        AppName: 'Sample App Android',
        Platform: 'android',
        IsEnabled: true,
    },
]
