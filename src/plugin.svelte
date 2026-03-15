<div class="cycling-effort-panel" class:cycling-effort-panel-mobile={isMobile}>
    <div class="fg-yellow">
        Cycling effort{#if $uiState.hasRoute}: <span class="label"
                ><strong class="size-m">{$uiState.totalEffort} points</strong></span
            >{/if}
    </div>
    {#if $uiState.hasRoute}
        <section class="effort-box fg-yellow mt-5 mb-5">
            <span class="size-xs">Weather impact: {$uiState.weatherImpact} points</span>
        </section>
        <section class="route-graph-box mt-5 mb-5">
            {#if hasProfile}
                <svg
                    class="route-graph"
                    viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
                    role="img"
                    aria-label="Elevation over distance"
                >
                    <rect
                        x={chartX}
                        y={chartY}
                        width={chartW}
                        height={chartH}
                        rx="6"
                        class="graph-bg"
                    />

                    {#each yTickValues as yTick}
                        <line
                            x1={chartX}
                            x2={chartX + chartW}
                            y1={chartY +
                                chartH -
                                ((yTick - elevationMin) / elevationRange) * chartH}
                            y2={chartY +
                                chartH -
                                ((yTick - elevationMin) / elevationRange) * chartH}
                            class="grid-line"
                        />
                        <text
                            x={chartX - 6}
                            y={chartY +
                                chartH -
                                ((yTick - elevationMin) / elevationRange) * chartH +
                                3}
                            class="axis-text"
                            text-anchor="end"
                        >
                            {formatElevationTick(yTick)}
                        </text>
                    {/each}

                    {#each xTickValues as xTick, idx}
                        <line
                            x1={chartX + (xTick / distanceRange) * chartW}
                            x2={chartX + (xTick / distanceRange) * chartW}
                            y1={chartY}
                            y2={chartY + chartH}
                            class="grid-line grid-line-v"
                        />
                        <text
                            x={chartX +
                                (xTick / distanceRange) * chartW -
                                (idx === xTickValues.length - 1 ? 8 : 0)}
                            y={chartY + chartH + 16}
                            class="axis-text"
                            text-anchor="middle"
                        >
                            {formatDistanceTick(xTick)}
                        </text>
                    {/each}

                    {#if graphSegments.length}
                        {#each graphSegments as segment}
                            <line
                                x1={chartX + (segment.startDistanceKm / distanceRange) * chartW}
                                y1={chartY +
                                    chartH -
                                    ((segment.startElevationM - elevationMin) / elevationRange) *
                                        chartH}
                                x2={chartX + (segment.endDistanceKm / distanceRange) * chartW}
                                y2={chartY +
                                    chartH -
                                    ((segment.endElevationM - elevationMin) / elevationRange) *
                                        chartH}
                                stroke={segment.color}
                                class="profile-segment"
                            />
                        {/each}
                    {:else}
                        <path d={profilePath} class="profile-line" />
                    {/if}
                    <!--<text x={8} y={11} class="axis-title">Elevation (Y)</text>-->
                    <!--<text x={GRAPH_WIDTH / 2} y={GRAPH_HEIGHT - 4} class="axis-title" text-anchor="middle">Distance (X)</text>-->
                </svg>
                <div class="graph-info size-xxs">
                    <span><span class="iconfont"></span> {$uiState.distanceKm} km</span>
                    <span><span class="iconfont">3</span> {$uiState.ascentM} m</span>
                    <span><span class="iconfont">4</span> {$uiState.descentM} m</span>
                    <button
                        class="invert-route-btn"
                        aria-pressed={$uiState.isRouteInverted}
                        on:click={handleInvertRoute}
                        tabindex="0"
                    >
                        {#if $uiState.isRouteInverted}
                            <div class="checkbox noselect">Invert</div>
                        {:else}
                            <div class="checkbox noselect checkbox--off">Invert</div>
                        {/if}
                    </button>
                </div>
            {:else}
                <div class="graph-empty size-xs">Elevation profile unavailable for this route.</div>
            {/if}
        </section>

        <!--<section class="stats-grid">
            <article class="bordered-box rounded-box bg-gray">
                <span class="size-xs fg-orange-light">Distance / Ascent / Descent</span>
                <strong class="size-s">{$uiState.distanceKm} km / {$uiState.ascentM} m / {$uiState.descentM} m</strong>
            </article>-->
        <!--<article class="bordered-box rounded-box bg-gray">
                <span class="size-xs fg-orange-light">Weather Impact</span>
                <strong class="size-s">{$uiState.weatherImpact} points</strong>
            </article>-->
        <!--<article class="bordered-box rounded-box bg-gray">
                <span class="size-xs fg-orange-light">Segments</span>
                <strong class="size-s">{$uiState.segmentCount}</strong>
            </article>
            <article class="bordered-box rounded-box bg-gray">
                <span class="size-xs fg-orange-light">Model / Time</span>
                <strong class="size-s">{$uiState.model}</strong>
                <small>{$uiState.forecastTime}</small>
            </article>-->
        <!--</section>-->
        <section>
            <!--tooltip--left data-tooltip="{$uiState.status}"-->
            <div
                class="rhbottom__legend metric-legend mt-5 noselect"
                style="background: {legendGradient};"
            >
                <span>Easier</span>
                <span></span>
                <span></span>
                <span></span>
                <span></span>
                <span></span>
                <span>Harder</span>
                <span></span>
            </div>
        </section>
    {/if}

    {#if $uiState.status}
        <p class="status fg-gray-light size-xs">{$uiState.status}</p>
    {/if}
    <!--{#if !$uiState.computedAt}
        <p class="status size-xs">{$uiState.status}</p>
    {/if}
    {#if $uiState.computedAt}
        <p class="size-xxs computed-at">Last run: {$uiState.computedAt}</p>
    {/if}-->
    {#if $uiState.isComputing}
        <span class="badge fg-white bg-red size-xs shaky">Updating</span>
    {/if}
</div>

<script context="module">
    import { controller } from './lib/cyclingEffortController';

    export const onmount = () => controller.mount();
    export const onopen = () => controller.open();
    export const onclose = () => controller.close();
    export const ondestroy = () => controller.destroy();
</script>

<script>
    import { isMobile } from '@windy/rootScope';
    import { effortLegendGradient } from './lib/windMath';
    import { uiState } from './lib/uiState';

    const handleInvertRoute = () => controller.invertRoute();

    $: legendGradient = effortLegendGradient($uiState.weatherWeightPercent ?? 75);
    const GRAPH_WIDTH = 340;
    const GRAPH_HEIGHT = 120;
    const PAD_TOP = 12;
    const PAD_RIGHT = 14;
    const PAD_BOTTOM = 28;
    const PAD_LEFT = 48;

    const chartX = PAD_LEFT;
    const chartY = PAD_TOP;
    const chartW = GRAPH_WIDTH - PAD_LEFT - PAD_RIGHT;
    const chartH = GRAPH_HEIGHT - PAD_TOP - PAD_BOTTOM;

    const ticks = count => Array.from({ length: count }, (_unused, idx) => idx);
    const formatDistanceTick = value => `${value.toFixed(1)} km`;
    const formatElevationTick = value => `${Math.round(value)} m`;

    $: profile = Array.isArray($uiState.elevationProfile) ? $uiState.elevationProfile : [];
    $: hasProfile = profile.length > 1;
    $: graphSegments = Array.isArray($uiState.routeGraphSegments)
        ? $uiState.routeGraphSegments
        : [];
    $: distanceMax = hasProfile
        ? Math.max(...profile.map(point => Number(point.distanceKm) || 0))
        : 1;
    $: elevationMin = hasProfile
        ? Math.min(...profile.map(point => Number(point.elevationM) || 0))
        : 0;
    $: elevationMax = hasProfile
        ? Math.max(...profile.map(point => Number(point.elevationM) || 0))
        : 1;
    $: elevationRange = Math.max(1, elevationMax - elevationMin);
    $: distanceRange = Math.max(0.001, distanceMax);
    $: xTickValues = ticks(5).map(idx => (distanceMax * idx) / 4);
    $: yTickValues = ticks(5).map(idx => elevationMin + (elevationRange * idx) / 4);
    $: profilePath = hasProfile
        ? profile
              .map((point, idx) => {
                  const x = chartX + ((Number(point.distanceKm) || 0) / distanceRange) * chartW;
                  const y =
                      chartY +
                      chartH -
                      (((Number(point.elevationM) || 0) - elevationMin) / elevationRange) * chartH;
                  return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
              })
              .join(' ')
        : '';
</script>

<style lang="less">
    /* Style variables are used from the windy parent page */
    //:global(#plugin-rhbottom .cycling-panel .stats-grid) {
    //    grid-template-columns: repeat(3, minmax(0, 1fr));
    //}

    .cycling-effort-panel {
        &.cycling-effort-panel-mobile {
            padding: 30px 15px 15px;
        }
    }

    /*.title-row {*/
    /*    display: flex;*/
    /*    justify-content: space-between;*/
    /*    gap: 10px;*/
    /*    align-items: flex-start;*/
    /*}*/

    /*.stats-grid {*/
    /*    display: grid;*/
    /*    grid-template-columns: repeat(2, minmax(0, 1fr));*/
    /*    gap: 4px;*/
    /*}*/

    /*.stats-grid article {*/
    /*    padding: 7px 8px;*/
    /*    display: grid;*/
    /*    gap: 2px;*/
    /*}*/

    /*.computed-at {*/
    /*    margin: 0;*/
    /*    font-size: 11px;*/
    /*    color: #526779;*/
    /*}*/

    .route-graph-box {
        position: relative;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.06);
        background: var(--color-background-primary);
        padding: 4px;

        .route-graph {
            width: 100%;
            display: block;

            .graph-bg {
                fill: rgba(255, 255, 255, 0.03);
                stroke: rgba(255, 255, 255, 0.1);
                stroke-width: 1;
            }

            .grid-line {
                stroke: rgba(255, 255, 255, 0.1);
                stroke-width: 1;
            }

            .grid-line-v {
                stroke-dasharray: 3 3;
            }

            .profile-line {
                fill: none;
                stroke: rgba(255, 255, 255, 0.9);
                stroke-width: 2.4;
                stroke-linejoin: round;
                stroke-linecap: round;
            }

            .profile-segment {
                stroke-width: 2.4;
                stroke-linecap: round;
                stroke-linejoin: round;
            }

            .axis-text {
                fill: var(--color-yellow);
                font-size: 9px;
            }

            /*.axis-title {*/
            /*    fill: var(--color-yellow);*/
            /*    font-size: 10px;*/
            /*    font-weight: 600;*/
            /*}*/
        }

        .graph-info {
            display: flex;
            align-items: left;
            justify-content: flex-end;
            gap: 5px;
            margin-top: 2px;
            margin-left: 18px;
            color: var(--color-yellow);
            font-size: 8px;
            line-height: 1.1;

            span {
                opacity: 0.92;
            }
        }

        .graph-empty {
            color: var(--color-yellow);
            padding: 8px 4px;
        }
    }

    .invert-route-btn {
        background: none;
        border: none;
        color: inherit;
        cursor: pointer;
        padding: 0 2px;
        font-size: 11px;
        margin-left: auto;
        margin-right: 2px;
    }

    .metric-legend {
        padding: 0 6px 0 10px;
        border-radius: 20px;

        > span {
            width: 12.5%;
        }
    }
</style>
