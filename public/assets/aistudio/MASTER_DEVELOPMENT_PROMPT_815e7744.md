# MASTER DEVELOPMENT PROMPT
# SKYCONTROL – Professional Air Traffic Control Radar Simulator

## 1. ROLE AND OBJECTIVE

Act as a senior aviation simulation software architect, air traffic control systems engineer, aerospace software developer, UX/UI designer, and full-stack TypeScript engineer.

Your mission is to design and implement a complete, professional, browser-based Air Traffic Control (ATC) radar simulator inspired by the functionality of:

https://atcradarsimulator.com/

Do not create a simple visual imitation or a static dashboard.

Build a genuinely interactive simulation platform where users can operate as air traffic controllers, manage aircraft movements, issue navigation instructions, sequence arrivals, manage departures, detect conflicts, and safely coordinate simulated air traffic.

The final application must be functional, modular, extensible, realistic in its simulation behavior, and suitable for future expansion.

The application is an educational and entertainment simulator, not a certified aviation training system or a real-world air traffic control tool.

## 2. PRODUCT VISION

Product name: SKYCONTROL

Platform: Web application

Architecture: Modular, component-based, event-driven

Simulation: Real-time, deterministic, configurable

Primary language: English

Internationalization: Support future Persian and RTL localization.

Core experience:
A realistic ATC radar environment where the user controls multiple aircraft simultaneously.

The simulator must support:
- Arrival aircraft
- Departure aircraft
- Overflight aircraft
- Approach control
- Radar vectoring
- Aircraft separation
- Runway management
- ILS approaches
- SID and STAR procedures
- Holding patterns
- Conflict detection
- Radio communication
- Flight progress strips
- Multiple airports
- Custom scenarios

## 3. TECHNOLOGY STACK

Frontend:
- React
- TypeScript
- Vite
- Tailwind CSS
- Zustand
- PixiJS or HTML5 Canvas for radar rendering
- MapLibre GL JS for geographic visualization

Backend:
- Node.js
- TypeScript
- Fastify or Express
- WebSocket for real-time communication

Database:
- PostgreSQL
- IndexedDB for offline persistence

Audio:
- Web Audio API
- Text-to-Speech integration
- Optional Speech Recognition

Testing:
- Vitest
- Playwright

Keep the simulation engine independent of the UI framework.

Do not put aircraft physics, navigation calculations, conflict detection, or aviation rules inside React components.

## 4. CORE SYSTEM ARCHITECTURE

Create the following independent modules:

1. Simulation Engine
2. Aircraft Management
3. Flight Plan Management
4. Radar Display
5. Geographic Map System
6. Navigation and Waypoints
7. Airport Management
8. Runway Management
9. SID/STAR Procedures
10. ILS Approach System
11. Conflict Detection
12. Separation Monitoring
13. ATC Command Processing
14. Radio Communication
15. Flight Progress Strips
16. Weather Simulation
17. Scenario Editor
18. Scoring and Evaluation
19. Replay and Event Recording
20. User Settings
21. Database and Persistence
22. Audio Management

Every module must have a clear responsibility and well-defined interfaces.

Use event-driven communication between modules.

## 5. AIRCRAFT SIMULATION ENGINE

Implement a dedicated aircraft simulation engine.

Each aircraft must contain:

- Unique aircraft ID
- Callsign
- Aircraft type
- Aircraft category
- ICAO aircraft type code
- Registration
- Departure airport
- Destination airport
- Current latitude
- Current longitude
- Current altitude
- Indicated airspeed
- Ground speed
- True heading
- Target heading
- Vertical speed
- Target altitude
- Target speed
- Bank angle
- Turn rate
- Current waypoint
- Flight plan
- Assigned runway
- Aircraft status
- Transponder code
- Controller assignment
- Radio frequency
- Emergency status

Implement realistic and configurable calculations for:

- Aircraft movement
- Heading changes
- Turn radius
- Speed acceleration and deceleration
- Climbing
- Descending
- Altitude stabilization
- Navigation
- Wind effects
- Ground speed
- Time to waypoint
- Route following
- Aircraft approach
- Landing
- Takeoff
- Go-around
- Holding patterns

Use a fixed simulation timestep with an accumulator.

Separate simulation time from rendering time.

Support:
- Pause
- Resume
- Reset
- Simulation speed x1
- Simulation speed x2
- Simulation speed x5
- Simulation speed x10

All aircraft movements must be calculated by the simulation engine rather than by UI animations.

## 6. RADAR DISPLAY

Create a professional ATC radar interface.

The radar must support:

- Dark aviation-style theme
- Geographic map background
- Aircraft symbols
- Aircraft data blocks
- Callsigns
- Altitude labels
- Speed labels
- Heading indicators
- Heading vectors
- Route lines
- Waypoints
- Airport symbols
- Runway display
- Sector boundaries
- Restricted airspace
- Range rings
- Distance measurement
- Bearing measurement
- Zoom
- Pan
- Center on selected aircraft
- Show/hide map layers
- Radar range selection

Aircraft data blocks must be interactive.

Single click:
Select aircraft.

Double click:
Assume control of aircraft and assign it to the active controller.

Allow the user to reposition aircraft labels to prevent overlapping.

Provide configurable radar symbology.

## 7. AIRCRAFT CONTROL PANEL

Create a contextual command panel for the selected aircraft.

Support these commands:

HEADING:
- Turn left
- Turn right
- Fly heading
- Direct to waypoint

ALTITUDE:
- Climb to altitude
- Descend to altitude
- Maintain altitude
- Expedite climb
- Expedite descent

SPEED:
- Increase speed
- Reduce speed
- Maintain speed
- Set target speed

NAVIGATION:
- Resume own navigation
- Proceed direct to waypoint
- Enter holding pattern
- Exit holding pattern

APPROACH:
- Join localizer
- Intercept ILS
- Cleared for ILS approach
- Go around

LANDING:
- Cleared to land
- Landing completed

DEPARTURE:
- Cleared for takeoff
- Follow SID
- Climb to assigned altitude

COORDINATION:
- Transfer aircraft
- Accept handoff
- Release control

Every command must:
1. Validate the aircraft state.
2. Validate the command parameters.
3. Update the aircraft's target state.
4. Generate an event.
5. Update the radar display.
6. Update the flight progress strip.
7. Generate radio communication when enabled.

Never display a successful command when the simulation engine has rejected it.

## 8. AIRPORT SYSTEM

Create a flexible airport database.

Each airport must contain:

- ICAO code
- IATA code
- Airport name
- Country
- Geographic coordinates
- Elevation
- Magnetic variation
- Runways
- Runway directions
- Runway lengths
- Runway widths
- Taxiways
- Aprons
- Navigation aids
- ILS frequencies and parameters
- Waypoints
- SID procedures
- STAR procedures
- Approach procedures
- Control sectors

Support multiple airports.

Initial airport examples:
- London Heathrow
- Rome Fiumicino
- Warsaw Chopin
- Dubai International
- Toronto Pearson
- Sydney Kingsford Smith
- Tunis-Carthage

Use properly licensed or open airport data.

Never invent real-world navigation procedures or frequencies.

Keep airport data separate from application code.

Provide a data import and validation system.

## 9. FLIGHT PLAN MANAGEMENT

Implement complete flight plan management.

Each flight plan must include:

- Flight identification
- Aircraft type
- Departure
- Destination
- Alternate airport
- Route
- Cruise altitude
- Requested departure time
- Estimated arrival time
- Assigned runway
- SID
- STAR
- Approach procedure
- Squawk code
- Flight status

Support:
- Create flight
- Edit flight
- Delete flight
- Activate flight
- Suspend flight
- Modify route
- Assign runway
- Change flight status

## 10. ARRIVAL MANAGEMENT

Implement an arrival management system.

The system must:
- Generate arriving traffic.
- Detect aircraft entering the terminal area.
- Display arrival information.
- Allow heading changes.
- Allow altitude changes.
- Allow speed adjustments.
- Support STAR procedures.
- Support radar vectoring.
- Support sequencing.
- Support holding patterns.
- Support ILS interception.
- Support final approach.
- Detect unstable approaches.
- Support go-around.
- Manage runway sequencing.

Display arrival sequence and estimated landing times.

## 11. DEPARTURE MANAGEMENT

Implement a complete departure simulation.

Features:
- Aircraft preparation
- Runway assignment
- Takeoff clearance
- Takeoff roll
- Rotation
- Initial climb
- SID navigation
- Altitude restrictions
- Departure separation
- Transfer to next sector

Support configurable departure intervals and runway occupancy constraints.

## 12. ILS APPROACH SIMULATION

Implement a dedicated ILS simulation module.

Model:
- Localizer
- Glideslope
- Final approach course
- Interception angle
- Aircraft distance to runway
- Glide path deviation
- Localizer deviation
- Approach stabilization
- Decision altitude
- Landing threshold

Display ILS guidance visually.

Allow aircraft to intercept the localizer and glideslope.

Support missed approaches and go-around procedures.

## 13. CONFLICT DETECTION AND SAFETY MONITORING

Create an independent conflict detection engine.

Monitor:
- Horizontal separation
- Vertical separation
- Predicted closest point of approach
- Time to conflict
- Aircraft trajectories
- Restricted airspace
- Runway occupancy
- Approach sequencing

Implement configurable separation minima.

Provide:
- STCA alerts
- Proximity warnings
- Predicted conflict warnings
- Separation infringement alerts
- Airspace violation alerts
- Runway conflict alerts

Use severity levels:
- Advisory
- Warning
- Critical

Display alerts visually and optionally audibly.

The system must calculate future conflicts using projected aircraft trajectories, not only current distance.

Clearly distinguish simulated advisory thresholds from certified operational standards.

## 14. FLIGHT PROGRESS STRIPS

Create realistic flight progress strips.

Each strip must display:
- Callsign
- Aircraft type
- Departure
- Destination
- Current altitude
- Assigned altitude
- Speed
- Assigned heading
- Route
- Runway
- Flight status

Support:
- Drag and drop
- Sorting
- Filtering
- Selection
- Aircraft association
- Strip highlighting
- Automatic updates

The user must be able to issue commands directly from a flight strip.

## 15. RADIO COMMUNICATION

Implement a radio communication subsystem.

Generate context-aware pilot responses to controller commands.

Examples:
- Radar contact
- Turn left heading
- Turn right heading
- Climb and maintain
- Descend and maintain
- Reduce speed
- Cleared for ILS
- Cleared to land
- Go around
- Contact tower

Support:
- Pilot voice
- Controller voice
- Frequency selection
- Volume control
- Radio log
- Audio playback
- Text transcript
- Mute
- Phraseology configuration

Radio messages must reflect actual simulation events.

Do not generate a readback for a command that was not successfully accepted.

## 16. WEATHER SYSTEM

Simulate:
- Wind direction
- Wind speed
- Gusts
- Visibility
- Cloud ceiling
- Rain
- Snow
- Turbulence
- Wind shear
- Runway conditions

Weather must influence aircraft movement and approach behavior where applicable.

Allow users to configure weather manually or use predefined weather scenarios.

## 17. SCENARIO ENGINE

Build a scenario editor.

Allow users to configure:

- Airport
- Runways
- Weather
- Traffic density
- Arrival count
- Departure count
- Overflight count
- Aircraft types
- Starting positions
- Initial altitudes
- Flight routes
- Emergency situations
- Traffic generation intervals

Provide predefined scenarios:

1. Beginner
2. Normal Traffic
3. Busy Airport
4. Heavy Traffic
5. Bad Weather
6. Runway Closure
7. Emergency Aircraft
8. Multiple Aircraft Conflicts
9. Advanced Approach Control

Support saving and loading custom scenarios.

## 18. SCORING AND PERFORMANCE

Implement an evaluation engine.

Measure:
- Successful landings
- Successful departures
- Separation violations
- Conflict alerts
- Delayed flights
- Unnecessary vectoring
- Controller response time
- Approach efficiency
- Runway utilization
- Command errors

Generate a final performance report.

Provide a scoring system with configurable evaluation rules.

## 19. REPLAY AND EVENT HISTORY

Record all simulation events.

Support:
- Event timeline
- Aircraft trajectory history
- Command history
- Radio history
- Conflict history
- Pause and replay
- Restart from recorded scenarios
- Export simulation sessions

Replay must reproduce the same simulation state from the recorded initial state and event sequence.

## 20. USER INTERFACE DESIGN

Design a professional aviation control environment.

Visual direction:
- Dark charcoal background
- Radar green and cyan symbology
- Amber warnings
- Red critical alerts
- High-contrast text
- Compact aviation-style typography
- Minimal unnecessary decoration

Main layout:

TOP:
- Airport selector
- Simulation clock
- Simulation controls
- Weather
- Traffic statistics

CENTER:
- Full radar display

LEFT:
- Aircraft list
- Traffic information
- Alert panel

RIGHT:
- Selected aircraft information
- Command panel
- Flight plan details

BOTTOM:
- Flight progress strips
- Radio communication
- Event log

The radar must receive the highest visual priority.

Support:
- Full-screen mode
- Responsive layout
- Keyboard shortcuts
- Context menus
- Tooltips
- Configurable panels
- Customizable interface

Avoid generic administration dashboard aesthetics.

The interface must look and behave like a professional ATC workstation.

## 21. DATABASE DESIGN

Create normalized database schemas for:

- Airports
- Runways
- Navigation aids
- Waypoints
- Airspace sectors
- Procedures
- Aircraft types
- Aircraft
- Flight plans
- Scenarios
- Weather configurations
- Simulation sessions
- Commands
- Events
- Radio messages
- Conflict alerts
- User settings
- Performance reports

Use UUID identifiers.

Provide:
- Database migrations
- Foreign keys
- Indexes
- Validation
- Seed data
- Backup and restore

Separate static airport data from dynamic simulation state.

## 22. OFFLINE SUPPORT

The application should support offline operation.

Requirements:
- Cache application resources.
- Store airport data locally.
- Store scenarios locally.
- Save user settings.
- Save simulation sessions.
- Run the simulation engine without an internet connection.
- Synchronize optional user data when connectivity returns.

Do not make the core simulation dependent on an external API.

## 23. QUALITY AND TESTING

Create comprehensive automated tests.

Test:
- Aircraft movement
- Heading calculations
- Climb and descent
- Speed changes
- Navigation
- ILS interception
- Landing conditions
- Conflict detection
- Separation calculations
- Flight plan validation
- Scenario loading
- Replay determinism
- Radio event generation

Include edge cases and multiple aircraft interactions.

The simulation must remain stable with at least 50 simultaneous aircraft initially, with a scalable architecture targeting 200 or more.

## 24. DEVELOPMENT STRATEGY

Build the application in phases.

PHASE 1:
Architecture, project structure, radar rendering, geographic coordinate system, basic aircraft movement.

PHASE 2:
Aircraft management, flight plans, command processing, heading, altitude, and speed controls.

PHASE 3:
Airport system, runway system, navigation, waypoints, SID and STAR.

PHASE 4:
Arrival and departure management, ILS, holding, landing and go-around.

PHASE 5:
Conflict detection, separation monitoring, safety alerts.

PHASE 6:
Flight strips, radio communication, audio system.

PHASE 7:
Weather simulation, scenario editor, scoring and replay.

PHASE 8:
Offline support, performance optimization, testing and final polish.

Do not attempt to implement every feature in a single step.

Complete and test each phase before moving to the next one.

## 25. STRICT IMPLEMENTATION RULES

1. Inspect the existing project before modifying anything.
2. Preserve existing working functionality.
3. Create a clear architecture and folder structure.
4. Implement real functionality, not static mockups.
5. Never create buttons that do nothing.
6. Never use fake aircraft movements.
7. Never use random position changes as a substitute for navigation physics.
8. Never hardcode airport procedures into UI components.
9. Never mix rendering logic with simulation logic.
10. Validate every aircraft command.
11. Keep simulation calculations deterministic.
12. Handle errors and invalid states.
13. Optimize rendering for multiple aircraft.
14. Use reusable components.
15. Document important calculations and algorithms.
16. Write automated tests.
17. Maintain a working application at every development phase.
18. Do not replace real functionality with placeholder implementations.
19. Do not claim a feature is complete unless it works and has been tested.
20. Use configurable simulation parameters rather than pretending simplified models are certified real-world models.

## 26. REQUIRED DELIVERABLES

Produce:

1. Complete system architecture
2. Detailed project folder structure
3. Database schema
4. Simulation engine design
5. Radar rendering architecture
6. Aircraft movement algorithms
7. Conflict detection algorithms
8. Airport data format
9. Command system
10. API definitions
11. WebSocket event definitions
12. UI component architecture
13. Development roadmap
14. Automated test suite
15. Fully functional application

## 27. FIRST EXECUTION INSTRUCTION

Before writing code:

First analyze the requirements and create a technical implementation plan.

Then inspect the existing repository and determine whether an existing codebase must be preserved.

Identify:
- Architecture
- Dependencies
- Technical risks
- Missing information
- Required modules
- Implementation order

Create a detailed development checklist.

Then start implementing Phase 1.

Do not stop after producing documentation or a visual prototype.

Continue until the first working simulation is implemented, tested, and demonstrable.

For each completed phase, report:
- Implemented functionality
- Modified files
- Tests performed
- Remaining issues
- Next development phase

The final goal is a fully operational, modular, realistic ATC radar simulation platform.