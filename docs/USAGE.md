# Windy Cycling Effort Plugin

Windy.com plugin that evaluates cycling trip effort/difficulty for uploaded GPX/KML/GeoJSON route tracks.

Route segments are color-coded from green (easy) to red (hard) directly on the map, with a single effort score in the panel. Use it to compare forecast conditions and pinpoint the best time to ride.
The 'invert' option is there, so you can compare setting off in one or the other direction. Useful for routes that start and end at or near the same point.

Factors affecting effort which are evaluated:

- Route length
- Elevation profile (ascent/descent)
- Wind speed, wind gust speed, and wind direction relative to the direction of travel based on the current selected windy.com weather model weather predictions.

This plugin was made with The (flat) Netherlands in mind where wind is your biggest enemy on the bicycle.
It might be less useful for mountains (or very hilly areas) without much wind. As the weather factors taken into account have less effect on the 'total effort' than large changes in elevation.

Please note that this plugin is in beta. I have no clue how well these calculations will perform under different circumstances, as I can only validate and compare plugin output with my own experience on bike rides.
It might need more fine-tuning and/or balancing of the calculations.
If you have any feedback or suggestions, please feel free to reach out!

## Route segment / graph colours representing 'effort' / 'difficulty'

The segments of the route, and the colours in the graph range from green (easy) to red (difficult) to visualize effort along the route.
These are the rules:

Slow wind has low impact, high wind speed has high impact.
Tailwind makes cycling progressively easier the higher the wind(-gust) speeds go.
Headwind does the opposite, makes cycling progressively more difficult the higher wind(-gust) speeds go.
So: The faster the wind/gust speeds, the easier and respectively more difficult the effort gets.

Going up or downhill always has the same impact regardless of weather.

And thus colours should reflect this by using the entire range going from dark to light green, light to dark yellow, light to dark orange, light to dark red. The center point should be no wind/gust or elevation change at all.

## Installation

Install the plugin in Windy as an external plugin.

- Go to [Windy.com](https://www.windy.com/), open the menu, and select "Install windy plugin".
- Click "Load plugin directly from URL" and enter `https://windy-plugins.com/9417045/windy-plugin-cycling-effort/0.1.3/plugin.min.js` into the text box.
  ![Install plugin on desktop](install.png 'Install plugin')
- Click "Install trusted plugin" and then close the menu.
- The plugin should now load and be available in the list of active plugins.

## Upgrading

1. Check [the plugin releases page](hhttps://github.com/jspeedz/windy-plugin-cycling-effort/releases) for the latest release number.
2. Uninstall the plugin by opening the menu and clicking on the bin icon next to the plugin name.
   ![Uninstall plugin on desktop](uninstall.png 'Remove plugin')
3. Now follow the Installation instructions again. Replace the version number in the URL with the latest available. 

## Desktop

The best way to use the plugin. Changing prediction models or forecast time is supported on desktop.

![Desktop use](desktop.png 'Desktop use')

1. Upload a GPX/KML/GeoJSON route using Windy's native upload feature.
    - Open the plugin by opening the menu and clicking "Cycling effort".
    - Open the menu and click "Display KML, GPX, or GeoJSON".
    - Select either a saved file or upload a new route to windy.
2. The plugin now auto-detects the route, computes difficulty, and colors the route segments.
3. The score will now be recalculated automatically when changing the forecast model or forecast time in the Windy UI.

## Mobile

This plugin also works on mobile devices after installing it on the desktop website.

![Mobile use](mobile.png 'Mobile use')

1. Upload a GPX/KML/GeoJSON route using Windy's native upload feature.
    - Open the plugin by opening the menu and clicking "Cycling effort".
    - Open the menu and click "Display KML, GPX, or GeoJSON".
    - Select either a saved file or upload a new route to windy.
2. Re-open the menu and click "Cycling effort". The effort will now be calculated automatically for the currently selected weather conditions.

