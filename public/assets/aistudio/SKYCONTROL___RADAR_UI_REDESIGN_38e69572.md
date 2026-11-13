# SKYCONTROL – RADAR UI REDESIGN
# Professional ATC Radar Interface, Precision Tracking & Mouse-Based Aircraft Control

Act as a senior ATC interface designer, radar systems engineer, human-computer interaction specialist, and React/TypeScript architect.

Your task is to redesign the existing SKYCONTROL radar interface into a professional, clean, intuitive and highly interactive air traffic control workstation.

IMPORTANT:
This is an enhancement of an existing working application.

Preserve:
- Existing aircraft physics engine.
- Existing radar simulation engine.
- Existing STCA and conflict detection.
- Existing ILS and landing systems.
- Existing takeoff engine.
- Existing runway management.
- Existing scenarios and flight data.
- Existing simulation clock.

Do not rebuild the simulation engine unnecessarily.

Do not create a decorative radar disconnected from real simulation data.

The radar must be the primary workspace.

# PART 1 – PROFESSIONAL SCREEN LAYOUT

Create a clean, balanced, low-clutter ATC interface.

The layout should contain four primary areas:

## A. TOP STATUS BAR

A compact horizontal bar containing:

- SKYCONTROL logo.
- Airport and sector name.
- UTC clock.
- Simulation speed.
- Pause/resume.
- Wind direction and speed.
- QNH.
- Active aircraft count.
- Active alerts.
- Radar connection and scan status.
- Scenario selection.
- Settings.

Do not display unnecessary statistics permanently.

## B. LEFT TRAFFIC PANEL

Create a collapsible aircraft traffic list.

Each aircraft row should show:

- Callsign.
- Aircraft type.
- Flight phase.
- Heading.
- Altitude.
- Ground speed.
- Distance from radar reference.
- Track freshness indicator.
- Conflict warning if applicable.

Sort and filter by:

- Arrivals.
- Departures.
- Selected aircraft.
- Conflict alerts.
- Untracked or stale aircraft.

Selecting an aircraft must select the same aircraft on the radar.

Keep the panel compact.

## C. CENTRAL RADAR DISPLAY

The radar must occupy the majority of the available screen.

Requirements:

- Accurate geographic projection.
- Configurable radar range.
- Zoom and pan.
- Range rings.
- Geographic orientation.
- Runway geometry.
- Airport reference points.
- Navigation fixes.
- Radar sweep.
- Aircraft symbols.
- Aircraft data blocks.
- Historical position trails.
- Velocity vectors.
- Selection highlighting.
- Conflict visualization.

Use a professional dark radar color scheme.

Avoid excessive colors, unnecessary borders, decorative animations and excessive text.

Aircraft information should remain readable at all zoom levels.

## D. RIGHT AIRCRAFT CONTROL PANEL

Do not keep a large permanent command panel open.

Open a compact contextual control panel only when an aircraft is selected.

The panel should contain:

- Callsign.
- Aircraft type.
- Flight phase.
- Current heading.
- Assigned heading.
- Current altitude.
- Cleared altitude.
- Current speed.
- Target speed.
- Flight plan.
- Assigned runway.
- ILS status.
- Separation status.

Allow the panel to collapse or close.

# PART 2 – PRECISION RADAR SCANNING AND TRACKING

This is the most important technical requirement.

The radar must display aircraft positions based on actual radar scan observations.

Do not simply animate aircraft independently of the radar scan.

Implement a proper scan-driven radar tracking architecture.

## 1. Radar Scan Model

Implement:

- Configurable antenna rotation speed.
- 360-degree azimuth scanning.
- Configurable scan interval.
- Configurable range.
- Scan timestamps.
- Radar observation records.
- Detection status.

The radar sweep must have a real relationship with aircraft detection.

## 2. Scan-Based Detection

When the rotating radar beam reaches an aircraft's azimuth:

1. Check whether the aircraft is within radar range.
2. Calculate its actual geographic position.
3. Generate a radar observation.
4. Record observation timestamp.
5. Associate the observation with the correct aircraft track.
6. Update the track using the new observation.

Do not update the displayed observed position before a valid scan observation occurs.

## 3. Track Prediction Between Scans

Between successive radar detections:

- Maintain the last confirmed radar observation.
- Estimate current track position using the tracking filter.
- Use ground velocity and heading.
- Predict aircraft position between scans.
- Clearly distinguish predicted positions from observed positions.

Use different visual states:

- Confirmed: recently detected.
- Predicted: extrapolated between scans.
- Stale: observation is older than the configured threshold.
- Lost: track has exceeded the maximum tracking timeout.

Never display a predicted position as a newly detected radar position.

## 4. Radar Track Quality

Display:

- Last detection time.
- Track age.
- Detection count.
- Track quality.
- Prediction uncertainty.

Allow configuration of radar update intervals.

Support measurement noise and configurable detection error only when the simulation settings enable them.

The system must support deterministic replay with a fixed random seed.

## 5. Track Association

Implement reliable association between radar observations and aircraft tracks.

Avoid:
- Duplicate aircraft tracks.
- Incorrect aircraft identification.
- Track switching between nearby aircraft.
- Sudden position jumps.
- False disappearance.
- False track creation.

Use a suitable tracking filter and document its limitations.

# PART 3 – CLICK-TO-SELECT AIRCRAFT

When the controller clicks an aircraft symbol or data block:

Open a small contextual command panel close to the selected aircraft.

The panel should not cover the aircraft or important radar information.

It should support:

### QUICK COMMANDS

- Heading change.
- Turn left.
- Turn right.
- Maintain heading.
- Altitude assignment.
- Climb.
- Descend.
- Speed assignment.
- Direct-to waypoint.
- Hold.
- Resume navigation.
- ILS approach.
- Go-around.

Show the current value and proposed new value.

Example:

BAW452
Current heading: 177°
New heading: 190°

Current altitude: FL066
New altitude: FL080

Current speed: 211 KT
New speed: 200 KT

Every command must be previewed before transmission.

Provide:

- Send command.
- Cancel.
- Command accepted.
- Command rejected.
- Pilot readback.

Do not show a successful readback before command validation.

## 2. COMMAND SHORTCUTS

Provide fast command controls.

Use keyboard shortcuts only when the radar is active and no text input is focused.

Allow users to customize shortcuts.

Do not allow accidental command transmission.

# PART 4 – MOUSE-BASED AIRCRAFT CONTROL

Implement intuitive mouse interaction.

The controller must be able to control aircraft using the radar itself.

## 1. HEADING VECTOR CONTROL

When an aircraft is selected:

- Display a heading control handle.
- Allow the user to drag the handle around the aircraft.
- Calculate the resulting heading from geographic bearing.
- Display the proposed heading.
- Show the proposed trajectory.
- Show the expected turn path.
- Show potential conflicts along the proposed trajectory.

On mouse release:

Open a command confirmation panel.

Only send the command after explicit confirmation.

The actual aircraft must turn using the existing physics engine.

Do not teleport aircraft to the selected direction.

## 2. DIRECT-TO NAVIGATION

Allow the controller to select an aircraft and click a navigation fix.

Display a preview of the proposed route.

Allow confirmation or cancellation.

After confirmation, issue a real Direct-to command through the existing command system.

## 3. ROUTE MODIFICATION

Support mouse-based route editing.

Allow:
- Adding waypoints.
- Removing waypoints.
- Changing waypoint order.
- Selecting a destination.
- Previewing the route.

Do not directly move the aircraft by dragging its symbol.

Dragging an aircraft data block must only reposition the label.

## 4. ALTITUDE AND SPEED COMMANDS

Support fast mouse-based altitude and speed selection through contextual controls.

Display:
- Current value.
- Target value.
- Proposed change.
- Estimated time to reach target.
- Validation warnings.

Require command confirmation.

# PART 5 – RADAR DATA BLOCKS

Create intelligent aircraft data blocks.

Each data block should have:

Line 1:
CALLSIGN / AIRCRAFT TYPE

Line 2:
ALTITUDE / CLEARED ALTITUDE

Line 3:
GROUND SPEED / HEADING / FLIGHT PHASE

Only display relevant information.

Allow drag-and-drop repositioning of data blocks.

Implement automatic collision avoidance between labels.

Avoid overlapping labels, aircraft symbols and runway markings.

Keep data blocks visually connected to their aircraft symbols.

Persist label positions during the current scenario.

# PART 6 – VISUAL SIMPLICITY

Use visual hierarchy.

Priority:

1. Aircraft position.
2. Aircraft identity.
3. Separation conflicts.
4. Flight phase.
5. Heading and altitude.
6. Additional details.

Use colors consistently:

- Normal traffic: green or cyan.
- Selected aircraft: bright highlighted color.
- Conflict warning: amber.
- Critical conflict: red.
- Stale track: muted color.
- Lost track: distinct warning state.

Do not use unnecessary flashing.

Critical warnings must be visible without overwhelming the entire radar.

# PART 7 – RADAR INTERACTION TOOLS

Add a compact toolbar with:

- Select.
- Measure distance.
- Measure bearing.
- Heading vector.
- Direct-to.
- Route editing.
- Zoom in/out.
- Center radar.
- Reset view.

Tools must have clear active/inactive states.

Support mouse wheel zoom and drag-to-pan.

Prevent accidental selection while panning.

Support appropriate desktop screen sizes.

# PART 8 – RESPONSIVE LAYOUT

On wide screens:
- Large central radar.
- Compact left traffic list.
- Contextual right command panel.

On smaller screens:
- Collapsible side panels.
- Radar remains the main focus.
- Selected aircraft controls open as an overlay.

Do not compress all controls into a crowded interface.

# PART 9 – ARCHITECTURE AND INTEGRATION

Before implementation, inspect the existing:

- RadarCanvas.tsx
- simulationStore.ts
- physics.ts
- conflict.ts
- aircraft data structures
- navigation system
- command handling system

Separate these responsibilities:

1. Radar rendering.
2. Radar scanning.
3. Radar observations.
4. Aircraft tracking.
5. Track prediction.
6. Mouse interaction.
7. Command preview.
8. Command validation.
9. Command transmission.

Use the existing simulation state and command engine.

Do not duplicate aircraft physics inside UI components.

Do not allow UI interactions to mutate aircraft positions directly.

# PART 10 – TESTING

Create automated tests for:

Radar:
- 360-degree scanning.
- Detection timing.
- Range filtering.
- Scan interval.
- Observation timestamps.
- Track updates.

Tracking:
- Position prediction.
- Track freshness.
- Stale detection.
- Lost track.
- Track association.
- Position jump prevention.

Mouse interaction:
- Aircraft selection.
- Data block dragging.
- Heading vector dragging.
- Direct-to selection.
- Route editing.
- Command cancellation.

Command system:
- Preview.
- Validation.
- Confirmation.
- Rejection.
- Pilot readback.

Integration:
- Radar scan updates the actual track.
- Track prediction works between scans.
- Mouse heading commands change aircraft heading through physics.
- Direct-to commands update actual navigation.
- Conflicting commands are rejected or appropriately flagged.

# STRICT REQUIREMENTS

- Preserve all existing simulation engines.
- Preserve current aircraft and flight data.
- Do not create fake radar detections.
- Do not display predicted coordinates as confirmed scan observations.
- Do not teleport aircraft using mouse interactions.
- Do not send commands without confirmation.
- Do not implement decorative controls without functionality.
- Keep the UI clean and uncluttered.
- Run all existing tests.
- Add new regression tests.
- Report actual test results.

# FINAL OBJECTIVE

Transform SKYCONTROL into a professional, clean and intuitive radar control workstation.

The controller must be able to:

1. Observe accurate scan-driven aircraft tracks.
2. Select any aircraft with a mouse click.
3. Open a compact contextual command panel.
4. Change heading by dragging a heading vector.
5. Assign direct-to navigation fixes by clicking.
6. Modify routes using mouse interactions.
7. Preview and confirm commands.
8. Monitor actual aircraft response through radar observations.

The radar must remain the central operational interface.

The final product should feel like a real ATC radar workstation, not a crowded aircraft dashboard.