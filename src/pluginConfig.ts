export default {
    name: 'windy-plugin-cycling-effort',
    version: '0.1.0',
    title: 'Cycling effort',
    icon: '🚴',
    description:
        'Evaluates uploaded GPX/KML/GeoJSON routes using route profile and Windy weather data. A "route effort" number will be asigned based on the elevation change and weather conditions. You can use this number to compare weather conditions and decide on when to go out cycling.',
    private: true,
    author: 'jspeedz',
    repository: 'https://github.com/jspeeds/windy-plugin-cycling-effort',
    homepage: 'https://github.com/jspeeds/windy-plugin-cycling-effort',
    desktopUI: 'embedded',
    mobileUI: 'fullscreen',
    routerPath: '/cycling-effort',
};
