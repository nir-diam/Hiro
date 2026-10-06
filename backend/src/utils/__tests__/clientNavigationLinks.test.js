const {
  buildWazeLink,
  buildGoogleMapsLink,
  resolveWazeLink,
  navigationPlaceholdersFromMetadata,
} = require('../clientNavigationLinks');

describe('clientNavigationLinks', () => {
  it('builds waze link from coordinates only', () => {
    expect(buildWazeLink(32.0853, 34.7818)).toBe('https://waze.com/ul?ll=32.0853,34.7818&navigate=yes');
  });

  it('prefers manual waze override', () => {
    expect(resolveWazeLink({
      address: 'Tel Aviv',
      latitude: 32,
      longitude: 34,
      wazeLinkOverride: 'https://waze.com/ul/custom',
      googleMapsLinkOverride: '',
    })).toBe('https://waze.com/ul/custom');
  });

  it('reads navigation placeholders from client metadata', () => {
    const map = navigationPlaceholdersFromMetadata({
      interviewArrival: {
        address: 'Ramat Gan',
        latitude: 32.08,
        longitude: 34.81,
      },
    });
    expect(map.waze_link).toContain('waze.com/ul?ll=32.08,34.81');
    expect(map.google_maps_link).toContain('google.com/maps/dir/');
  });
});
