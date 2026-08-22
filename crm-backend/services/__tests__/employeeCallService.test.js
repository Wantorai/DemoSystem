const ORIGINAL_ENV = process.env;

const loadService = ({ healthStatus, healthError } = {}) => {
  jest.resetModules();
  const get = healthError
    ? jest.fn().mockRejectedValue(healthError)
    : jest.fn().mockResolvedValue({ status: healthStatus ?? 200 });
  jest.doMock('axios', () => ({ get }));
  return {
    get,
    service: require('../employeeCallService'),
  };
};

const configureProviders = () => {
  process.env.LIVEKIT_URL = 'wss://cloud.example.test';
  process.env.LIVEKIT_API_KEY = 'cloud_key';
  process.env.LIVEKIT_API_SECRET = 'cloud_secret_cloud_secret_cloud_secret';
  process.env.LIVEKIT_SELF_HOSTED_URL = 'wss://livekit.example.test';
  process.env.LIVEKIT_SELF_HOSTED_API_KEY = 'self_key';
  process.env.LIVEKIT_SELF_HOSTED_API_SECRET =
    'self_secret_self_secret_self_secret';
  process.env.LIVEKIT_PRIMARY_PROVIDER = 'self_hosted';
};

describe('employee call LiveKit provider selection', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    configureProviders();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  test('selects the self-hosted primary when its health endpoint is healthy', async () => {
    const { get, service } = loadService({ healthStatus: 200 });

    await expect(service.selectLiveKitProvider()).resolves.toBe('self_hosted');
    expect(get).toHaveBeenCalledWith(
      'https://livekit.example.test/',
      expect.objectContaining({ timeout: 2500 })
    );
  });

  test.each([500, 502])(
    'falls back to Cloud when the primary returns HTTP %s',
    async (healthStatus) => {
      const { service } = loadService({ healthStatus });

      await expect(service.selectLiveKitProvider()).resolves.toBe('cloud');
    }
  );

  test('falls back to Cloud when the primary cannot be reached', async () => {
    const { service } = loadService({ healthError: new Error('timeout') });

    await expect(service.selectLiveKitProvider()).resolves.toBe('cloud');
  });

  test('pins token generation to the provider selected for the call', async () => {
    const { service } = loadService({ healthStatus: 200 });
    const mediaProvider = await service.selectLiveKitProvider();
    const call = service.createCall({
      roomId: 42,
      caller: { id: 1, name: 'Caller' },
      callee: { id: 2, name: 'Callee' },
      mediaProvider,
    });

    const tokenResponse = await service.createParticipantToken(call.callId, {
      id: 1,
      name: 'Caller',
    });

    expect(tokenResponse.mediaProvider).toBe('self_hosted');
    expect(tokenResponse.serverUrl).toBe('wss://livekit.example.test');
    expect(tokenResponse.token).toEqual(expect.any(String));
    service.finishCall(call.callId, 'ended', 'test', 1);
  });
});
