export const DEFAULT_MASTER_YAML = `version: 2
defaults:
  active_preset: analyst
  secondary_lens_threshold: 0.2
  top_secondary_limit: 3
  evidence_confidence_floor: 0.35
  view_rank_floor: 0.2
  query_preview_limit: 6
arg_types:
  field_selector:
    type: string
  numeric_threshold:
    type: number
  comparison_operator:
    type: enum
    values:
      - exists
      - is
      - contains
      - ">"
      - ">="
      - "<"
      - "<="
      - "!="
  primitive_type:
    type: enum
    values:
      - string
      - number
      - boolean
      - object
      - array
      - undefined
  lens_id:
    type: string
    source: taxonomy.domains
  view_id:
    type: string
    source: view_specs
  dimension_name:
    type: enum
    values:
      - time
      - space
      - agent
      - domain
      - catalyst
      - type
  tone_name:
    type: string
  semantic_term:
    type: string
  preset_id:
    type: string
  bias_target_type:
    type: enum
    values:
      - lens
      - view
  bias_target_id:
    type: string
  any_value:
    type: any
    required: false
  string_list:
    type: array
    items: string
  weighted_inputs:
    type: array
    items:
      type: object
      shape:
        path: field_selector
function_registry:
  field_exists:
    scope:
      - dataset
      - entity
      - relation
      - view
    returns: boolean
    description: Check whether a path resolves to a usable value.
    args:
      path: field_selector
  equals_value:
    scope:
      - dataset
      - entity
      - relation
      - view
    returns: boolean
    description: Compare a path against an expected value.
    args:
      path: field_selector
      value: any_value
  numeric_threshold:
    scope:
      - dataset
      - entity
      - relation
    returns: score
    description: Compare a numeric path against a threshold.
    args:
      path: field_selector
      op: comparison_operator
      value: numeric_threshold
  type_check:
    scope:
      - dataset
      - entity
      - relation
    returns: boolean
    description: Validate the primitive type found at a path.
    args:
      path: field_selector
      expected_type: primitive_type
  taxonomy_score:
    scope:
      - dataset
      - entity
    returns: score
    description: Read a domain score from a taxonomy hit map.
    args:
      path: field_selector
      domain: lens_id
      min_score: numeric_threshold
  tone_score:
    scope:
      - dataset
      - entity
    returns: score
    description: Read a tone score from a tone hit map.
    args:
      path: field_selector
      tone: tone_name
      min_score: numeric_threshold
  semantic_proximity:
    scope:
      - dataset
      - entity
    returns: score
    description: Count how many expanded semantic terms appear in a text path.
    args:
      path: field_selector
      term: semantic_term
      min_matches: numeric_threshold
  shared_dimension:
    scope:
      - relation
    returns: boolean
    description: Check whether relation endpoints share a dimension value.
    args:
      dimension: dimension_name
  temporal_distance:
    scope:
      - relation
    returns: score
    description: Measure time distance between relation endpoints.
    args:
      max_gap: numeric_threshold
  influence_link:
    scope:
      - dataset
      - relation
    returns: boolean
    description: Detect explicit influence structure.
    args: {}
  weighted_sum:
    scope:
      - dataset
      - entity
      - relation
    returns: score
    description: Compute a weighted sum from several inputs.
    args:
      inputs: weighted_inputs
      min_score: numeric_threshold
  threshold_gate:
    scope:
      - dataset
      - entity
      - relation
      - view
    returns: boolean
    description: Gate a numeric value path.
    args:
      value_path: field_selector
      min_score: numeric_threshold
  preset_bias:
    scope:
      - dataset
      - view
    returns: score
    description: Read preset weighting for a view or lens target.
    args:
      preset: preset_id
      target_type: bias_target_type
      target: bias_target_id
  enum_match:
    scope:
      - dataset
      - entity
      - relation
      - view
    returns: boolean
    description: Match a path against a list of values.
    args:
      path: field_selector
      values: string_list
  data_shape:
    scope:
      - dataset
    returns: score
    description: Classify data complexity from record count, field count, and type ratios.
    args:
      min_records: numeric_threshold
  density_score:
    scope:
      - dataset
    returns: score
    description: Measure information density to decide between dense vs sparse views.
    args:
      dense_threshold: numeric_threshold
  relationship_type:
    scope:
      - dataset
    returns: score
    description: Detect dominant relationship type in the data (hierarchy, network, sequence, comparison, part-whole).
    args: {}
  visual_channel_fit:
    scope:
      - dataset
      - view
    returns: score
    description: Score how well a view matches the data encoding needs.
    args:
      view: view_id
  field_pattern:
    scope:
      - dataset
    returns: boolean
    description: Check if any field name matches a regex pattern.
    args:
      pattern: semantic_term
  cardinality_check:
    scope:
      - dataset
    returns: score
    description: Check unique value count of a dimension for encoding decisions.
    args:
      dimension: dimension_name
      max_distinct: numeric_threshold
  dimension_count:
    scope:
      - dataset
    returns: score
    description: Count how many fields map to a given dimension.
    args:
      dimension: dimension_name
      min_count: numeric_threshold
  record_range:
    scope:
      - dataset
    returns: boolean
    description: Check if record count falls in a range for density-appropriate views.
    args:
      min: numeric_threshold
      max: numeric_threshold
  signal_signature:
    scope:
      - dataset
    returns: score
    description: Score signal-like characteristics in data using acoustic parameters (delay, feedback, decay, density).
    args:
      min_signal_fields: numeric_threshold
  growth_pattern:
    scope:
      - dataset
    returns: score
    description: Detect botanical branching patterns — parent-child, root-leaf, depth indicators.
    args:
      min_branch_signals: numeric_threshold
diagnostics:
  strict_validation: true
  trace_output: true
  fail_closed: true
taxonomy:
  domains:
    - id: innovation
      label: Innovation & Science
      parents:
        - research
      keywords:
        - invention
        - inventor
        - patent
        - innovation
        - telegraph
        - telephone
        - engine
        - discovery
        - theory
        - locomotive
        - radio
        - x-ray
        - periodic
    - id: history
      label: History & Society
      parents:
        - humanities
      keywords:
        - history
        - historical
        - revolution
        - war
        - empire
        - treaty
        - industrial
        - century
        - era
        - movement
    - id: narrative
      label: Narrative & Storytelling
      parents:
        - humanities
      keywords:
        - story
        - character
        - protagonist
        - antagonist
        - ally
        - mentor
        - witness
        - event
        - mood
        - tension
        - scene
        - setting
    - id: geography
      label: Geography & Place
      parents:
        - analytics
      keywords:
        - location
        - place
        - region
        - country
        - city
        - geography
        - continent
        - venue
        - map
        - where
    - id: communication
      label: Communication & Networks
      parents:
        - innovation
      keywords:
        - telegraph
        - telephone
        - radio
        - signal
        - messaging
        - network
        - voice
        - wireless
    - id: arts
      label: Arts & Culture
      parents:
        - humanities
      keywords:
        - art
        - artist
        - painting
        - music
        - cinema
        - photography
        - exhibition
        - impressionism
    - id: analytics
      label: Analytics & Research
      parents: []
      keywords:
        - count
        - score
        - metric
        - total
        - value
        - comparison
        - dataset
        - analysis
    - id: education
      label: Education & Learning
      parents:
        - humanities
      keywords:
        - learn
        - student
        - teacher
        - curriculum
        - lesson
        - concept
        - skill
        - assessment
        - grade
        - course
        - module
        - knowledge
        - training
        - tutorial
    - id: economics
      label: Economics & Markets
      parents:
        - analytics
      keywords:
        - price
        - market
        - trade
        - supply
        - demand
        - gdp
        - inflation
        - revenue
        - cost
        - profit
        - growth
        - investment
        - economy
        - financial
    - id: biology
      label: Biology & Life Sciences
      parents:
        - research
      keywords:
        - species
        - cell
        - gene
        - organism
        - protein
        - ecosystem
        - evolution
        - habitat
        - taxonomy
        - classification
        - population
        - biodiversity
    - id: technology
      label: Technology & Computing
      parents:
        - innovation
      keywords:
        - software
        - hardware
        - algorithm
        - database
        - api
        - code
        - programming
        - internet
        - computer
        - digital
        - cloud
        - server
        - framework
    - id: social
      label: Social & People
      parents:
        - humanities
      keywords:
        - community
        - culture
        - society
        - group
        - family
        - relationship
        - organization
        - network
        - team
        - collaboration
        - role
        - population
    - id: botany
      label: Botany & Growth Systems
      parents:
        - biology
      keywords:
        - root
        - branch
        - leaf
        - stem
        - growth
        - seed
        - canopy
        - rhizome
        - mycelium
        - node
        - trunk
        - propagation
        - germination
        - photosynthesis
        - symbiosis
        - ecosystem
        - soil
        - nutrient
        - bloom
        - vine
        - prune
        - graft
    - id: sound
      label: Sound & Signal
      parents:
        - innovation
      keywords:
        - frequency
        - amplitude
        - phase
        - resonance
        - decay
        - delay
        - echo
        - reverb
        - signal
        - waveform
        - attenuation
        - harmonic
        - octave
        - pitch
        - tone
        - bass
        - treble
        - spectrum
        - doppler
        - spatial
        - binaural
        - feedback
    - id: structured_data
      label: Structured Data & Flow
      parents:
        - analytics
      keywords:
        - schema
        - field
        - record
        - column
        - row
        - table
        - pipeline
        - transform
        - query
        - index
        - key
        - value
        - type
        - constraint
        - validate
        - normalize
        - aggregate
        - join
        - filter
        - map
semantic_packs:
  dimension_aliases:
    time:
      - year
      - date
      - time
      - era
      - decade
      - period
      - century
      - created
      - updated
      - timestamp
      - born
      - died
      - when
      - season
      - age
    space:
      - location
      - place
      - city
      - country
      - region
      - area
      - state
      - continent
      - geography
      - latitude
      - longitude
      - lat
      - lng
      - where
      - venue
    agent:
      - name
      - person
      - author
      - creator
      - inventor
      - artist
      - user
      - player
      - maker
      - founder
      - character
      - actor
      - innovator
      - pioneer
      - who
    domain:
      - domain
      - field
      - category
      - type
      - genre
      - discipline
      - sector
      - industry
      - subject
      - role
      - class
      - kind
    catalyst:
      - catalyst
      - cause
      - motivation
      - reason
      - trigger
      - influenced_by
      - influenced
      - source
      - origin
      - movement
      - inspired_by
      - based_on
      - related_movement
  query_aliases:
    space:
      - place
      - region
      - country
      - geography
      - location
      - area
      - where
    time:
      - timeline
      - temporal
      - chronology
      - decade
      - era
      - when
    views:
      constellation:
        - constellation
        - graph
        - web
        - network
        - connections
      timeline:
        - timeline
        - chronology
        - temporal
        - sequence
      clusters:
        - cluster
        - group
        - categorize
      explorer:
        - explorer
        - table
        - raw
        - data
      matrix:
        - matrix
        - proximity
        - similarity
        - compare
      flow:
        - flow
        - pathway
        - chain
        - influence path
      map:
        - map
        - geo
        - regional
        - hub
  synonym_groups:
    place:
      - place
      - region
      - country
      - geography
      - location
      - area
      - locale
    story:
      - story
      - narrative
      - plot
      - tale
      - account
    influence:
      - influence
      - inspired
      - derived
      - based_on
      - shaped
  phonetics:
    color:
      - colour
    analyze:
      - analyse
    organization:
      - organisation
  literary_variants:
    protagonist:
      - hero
      - lead
      - main character
    antagonist:
      - villain
      - rival
      - opponent
    catalyst:
      - spark
      - trigger
      - inciting force
  tone_cues:
    anxious:
      - anxious
      - nervous
      - uneasy
      - worried
      - tense
    determined:
      - determined
      - driven
      - resolved
      - focused
    cryptic:
      - cryptic
      - obscure
      - enigmatic
      - coded
    haunted:
      - haunted
      - burdened
      - troubled
      - lingering
presets:
  historian:
    label: Historian
    lens_weights:
      history: 1.35
      innovation: 1.1
      narrative: 1.05
    view_bias:
      timeline: 1.35
      flow: 1.15
      map: 1.1
  analyst:
    label: Analyst
    lens_weights:
      analytics: 1.3
      geography: 1.05
      communication: 1.05
    view_bias:
      matrix: 1.35
      explorer: 1.2
      clusters: 1.1
  storyteller:
    label: Storyteller
    lens_weights:
      narrative: 1.35
      arts: 1.1
      geography: 1.05
    view_bias:
      constellation: 1.2
      flow: 1.15
      map: 1.05
  researcher:
    label: Researcher
    lens_weights:
      innovation: 1.2
      analytics: 1.2
      history: 1.05
    view_bias:
      explorer: 1.2
      matrix: 1.15
      timeline: 1.1
  educator:
    label: Educator
    lens_weights:
      education: 1.35
      social: 1.1
      narrative: 1.1
    view_bias:
      flow: 1.3
      clusters: 1.2
      timeline: 1.1
  economist:
    label: Economist
    lens_weights:
      economics: 1.35
      analytics: 1.2
      geography: 1.1
    view_bias:
      matrix: 1.3
      explorer: 1.2
      map: 1.15
  scientist:
    label: Scientist
    lens_weights:
      biology: 1.2
      innovation: 1.15
      analytics: 1.15
    view_bias:
      clusters: 1.25
      matrix: 1.2
      explorer: 1.15
  technologist:
    label: Technologist
    lens_weights:
      technology: 1.3
      innovation: 1.15
      communication: 1.1
    view_bias:
      constellation: 1.2
      flow: 1.2
      explorer: 1.15
  signature:
    label: Signature
    lens_weights:
      botany: 1.4
      sound: 1.35
      structured_data: 1.3
      biology: 1.15
      communication: 1.1
      analytics: 1.05
    view_bias:
      flow: 1.35
      constellation: 1.3
      clusters: 1.2
      timeline: 1.1
view_specs:
  constellation:
    enabled: true
    label: Constellation
    base_weight: 1
  timeline:
    enabled: true
    label: Timeline
    base_weight: 1
  clusters:
    enabled: true
    label: Clusters
    base_weight: 1
  explorer:
    enabled: true
    label: Explorer
    base_weight: 1
  matrix:
    enabled: true
    label: Matrix
    base_weight: 0.95
  flow:
    enabled: true
    label: Flow
    base_weight: 1
  map:
    enabled: true
    label: Map
    base_weight: 0.95
rule_sets:
  base:
    label: Base Logic
    rules:
      - innovation-keyword-support
      - innovation-dense-support
      - history-keyword-support
      - history-time-support
      - narrative-role-support
      - geography-support
      - communication-support
      - arts-support
      - analytics-metric-support
      - education-keyword-support
      - economics-keyword-support
      - biology-keyword-support
      - technology-keyword-support
      - social-keyword-support
      - botany-keyword-support
      - sound-keyword-support
      - structured-data-keyword-support
  semantic:
    label: Semantic Expansion
    rules:
      - narrative-tone-support
      - geography-semantic-support
  ranking:
    label: View Ranking
    rules:
      - influence-flow-preference
      - shared-space-map-preference
      - dense-data-matrix-preference
      - sparse-data-graph-preference
      - sequence-data-timeline-boost
      - hierarchy-field-detection
      - multi-metric-comparison
      - low-cardinality-cluster-boost
      - signal-signature-detection
      - growth-pattern-detection
  narrative:
    label: Narrative Support
    rules:
      - narrative-role-support
      - narrative-tone-support
  experimental:
    label: Experimental
    rules: []
rules:
  - id: innovation-keyword-support
    label: Innovation keywords support the innovation lens
    applies_to: entity
    enabled: true
    priority: 100
    function: taxonomy_score
    args:
      path: entity.domain_keyword_hits
      domain: innovation
      min_score: 1
    returns: score
    weight_strategy: direct_score
    derive:
      - action: boost_lens
        lens: innovation
        score: 0.45
    affects:
      - context_lens
    because: Technical and invention-related keywords imply an innovation framing.
    promotion: active
  - id: innovation-dense-support
    label: Innovation-dense datasets reinforce the innovation lens
    applies_to: dataset
    enabled: true
    priority: 99
    function: taxonomy_score
    args:
      path: dataset.domain_keyword_hits
      domain: innovation
      min_score: 8
    returns: score
    weight_strategy: direct_score
    derive:
      - action: boost_lens
        lens: innovation
        score: 1.1
    affects:
      - context_lens
    because: Repeated technical signals across the whole dataset indicate a strong innovation frame.
    promotion: active
  - id: history-keyword-support
    label: Historical language supports the history lens
    applies_to: dataset
    enabled: true
    priority: 95
    function: taxonomy_score
    args:
      path: dataset.domain_keyword_hits
      domain: history
      min_score: 1
    returns: score
    weight_strategy: direct_score
    derive:
      - action: boost_lens
        lens: history
        score: 0.8
    affects:
      - context_lens
    because: Historical markers indicate a social or time-layered interpretation.
    promotion: active
  - id: history-time-support
    label: Time-rich datasets reinforce the history lens
    applies_to: dataset
    enabled: true
    priority: 94
    when:
      - fact: dataset.flags.has_time_dimension
        op: is
        value: true
    derive:
      - action: boost_lens
        lens: history
        score: 0.7
      - action: prefer_view
        view: timeline
        score: 0.25
    affects:
      - context_lens
      - view
    because: Strong temporal structure supports a historical reading even when the subject is technical.
    promotion: active
  - id: narrative-role-support
    label: Role, mood, or event fields support the narrative lens
    applies_to: dataset
    enabled: true
    priority: 96
    when:
      - fact: dataset.flags.has_role_or_mood
        op: is
        value: true
    derive:
      - action: boost_lens
        lens: narrative
        score: 1.35
    affects:
      - context_lens
    because: Character roles, moods, and events point to narrative structure.
    promotion: active
  - id: narrative-tone-support
    label: Tone-heavy entities reinforce the narrative lens
    applies_to: entity
    enabled: true
    priority: 93
    function: tone_score
    args:
      path: entity.tone_hits
      tone: anxious
      min_score: 1
    returns: score
    weight_strategy: direct_score
    derive:
      - action: boost_lens
        lens: narrative
        score: 0.35
    affects:
      - context_lens
    because: Consistent emotional tone adds narrative framing.
    promotion: active
  - id: geography-support
    label: Place-heavy data supports the geography lens
    applies_to: dataset
    enabled: true
    priority: 90
    when:
      - fact: dataset.flags.has_space_dimension
        op: is
        value: true
    derive:
      - action: boost_lens
        lens: geography
        score: 0.65
      - action: prefer_view
        view: map
        score: 0.45
    affects:
      - context_lens
      - view
    because: Strong place information benefits spatial reasoning and map-like views.
    promotion: active
  - id: geography-semantic-support
    label: Geography language reinforces the geography lens
    applies_to: entity
    enabled: true
    priority: 89
    function: semantic_proximity
    args:
      path: entity.text
      term: place
      min_matches: 1
    returns: score
    weight_strategy: direct_score
    derive:
      - action: boost_lens
        lens: geography
        score: 0.2
    affects:
      - context_lens
    because: Place-oriented language adds geographic context even without formal geo fields.
    promotion: active
  - id: communication-support
    label: Communication terms support the communication lens
    applies_to: entity
    enabled: true
    priority: 92
    function: taxonomy_score
    args:
      path: entity.domain_keyword_hits
      domain: communication
      min_score: 1
    returns: score
    weight_strategy: direct_score
    derive:
      - action: boost_lens
        lens: communication
        score: 0.8
    affects:
      - context_lens
    because: Messaging and network terms indicate communication systems.
    promotion: active
  - id: arts-support
    label: Arts language supports the arts lens
    applies_to: entity
    enabled: true
    priority: 88
    function: taxonomy_score
    args:
      path: entity.domain_keyword_hits
      domain: arts
      min_score: 1
    returns: score
    weight_strategy: direct_score
    derive:
      - action: boost_lens
        lens: arts
        score: 0.75
    affects:
      - context_lens
    because: Cultural and artistic keywords imply an arts-oriented interpretation.
    promotion: active
  - id: analytics-metric-support
    label: Numeric metrics support the analytics lens
    applies_to: dataset
    enabled: true
    priority: 85
    when:
      - fact: dataset.flags.has_metric_dimension
        op: is
        value: true
    derive:
      - action: boost_lens
        lens: analytics
        score: 0.85
      - action: prefer_view
        view: matrix
        score: 0.35
    affects:
      - context_lens
      - view
    because: Quantitative signals benefit from analytic comparison views.
    promotion: active
  - id: influence-flow-preference
    label: Influence links prefer the flow view
    applies_to: relation
    enabled: true
    priority: 91
    function: influence_link
    args: {}
    returns: boolean
    weight_strategy: boolean_boost
    derive:
      - action: prefer_view
        view: flow
        score: 0.75
    affects:
      - view
    because: Directed influence chains read best as flow.
    promotion: active
  - id: shared-space-map-preference
    label: Shared place relations prefer the map view
    applies_to: relation
    enabled: true
    priority: 86
    guards:
      - function: equals_value
        args:
          path: dataset.flags.has_space_dimension
          value: true
    function: shared_dimension
    args:
      dimension: space
    returns: boolean
    weight_strategy: boolean_boost
    derive:
      - action: prefer_view
        view: map
        score: 0.25
    affects:
      - view
    because: Shared place relations become more legible in spatial views.
    promotion: active

  # --- DATA SHAPE RULES ---

  - id: dense-data-matrix-preference
    label: Dense datasets prefer matrix or explorer views
    applies_to: dataset
    enabled: true
    priority: 83
    function: density_score
    args:
      dense_threshold: 2
    returns: score
    weight_strategy: direct_score
    derive:
      - action: prefer_view
        view: matrix
        score: 0.45
      - action: prefer_view
        view: explorer
        score: 0.35
    affects:
      - view
    because: High-density data benefits from compact, scannable views like matrix or tables.
    promotion: active

  - id: sparse-data-graph-preference
    label: Sparse relational data prefers constellation or flow views
    applies_to: dataset
    enabled: true
    priority: 82
    function: record_range
    args:
      min: 2
      max: 50
    returns: boolean
    weight_strategy: boolean_boost
    guards:
      - function: equals_value
        args:
          path: dataset.flags.has_influence_links
          value: true
    derive:
      - action: prefer_view
        view: constellation
        score: 0.4
      - action: prefer_view
        view: flow
        score: 0.55
    affects:
      - view
    because: Small datasets with explicit relationships are best shown as graphs or flows rather than dense tables.
    promotion: active

  - id: sequence-data-timeline-boost
    label: Sequential data strongly prefers timeline
    applies_to: dataset
    enabled: true
    priority: 84
    function: relationship_type
    args: {}
    returns: score
    weight_strategy: direct_score
    guards:
      - function: equals_value
        args:
          path: dataset.flags.has_time_dimension
          value: true
    derive:
      - action: prefer_view
        view: timeline
        score: 0.55
      - action: boost_lens
        lens: history
        score: 0.4
    affects:
      - view
      - context_lens
    because: When the dominant data relationship is sequential and temporal data exists, timeline is the natural first view.
    promotion: active

  - id: hierarchy-field-detection
    label: Hierarchy fields suggest tree-like structure
    applies_to: dataset
    enabled: true
    priority: 81
    function: field_pattern
    args:
      pattern: "parent|child|level|depth|nested|hierarchy"
    returns: boolean
    weight_strategy: boolean_boost
    derive:
      - action: prefer_view
        view: flow
        score: 0.5
      - action: prefer_view
        view: clusters
        score: 0.3
    affects:
      - view
    because: Fields named parent, child, or level indicate tree structure which reads well as flow or nested clusters.
    promotion: active

  - id: multi-metric-comparison
    label: Multiple numeric fields suggest comparison views
    applies_to: dataset
    enabled: true
    priority: 80
    function: data_shape
    args:
      min_records: 3
    returns: score
    weight_strategy: direct_score
    guards:
      - function: equals_value
        args:
          path: dataset.flags.has_metric_dimension
          value: true
    derive:
      - action: boost_lens
        lens: analytics
        score: 0.5
      - action: prefer_view
        view: matrix
        score: 0.3
    affects:
      - context_lens
      - view
    because: Datasets with multiple numeric dimensions benefit from analytic comparison views.
    promotion: active

  - id: low-cardinality-cluster-boost
    label: Low-cardinality categories make good cluster candidates
    applies_to: dataset
    enabled: true
    priority: 79
    function: cardinality_check
    args:
      dimension: domain
      max_distinct: 8
    returns: score
    weight_strategy: direct_score
    derive:
      - action: prefer_view
        view: clusters
        score: 0.35
    affects:
      - view
    because: When a categorical dimension has few distinct values, clusters are visually clean and easy to compare.
    promotion: active

  # --- NEW DOMAIN RULES ---

  - id: education-keyword-support
    label: Education keywords support the education lens
    applies_to: entity
    enabled: true
    priority: 87
    function: taxonomy_score
    args:
      path: entity.domain_keyword_hits
      domain: education
      min_score: 1
    returns: score
    weight_strategy: direct_score
    derive:
      - action: boost_lens
        lens: education
        score: 0.7
    affects:
      - context_lens
    because: Learning and education terms indicate a pedagogical framing.
    promotion: active

  - id: economics-keyword-support
    label: Economics keywords support the economics lens
    applies_to: entity
    enabled: true
    priority: 87
    function: taxonomy_score
    args:
      path: entity.domain_keyword_hits
      domain: economics
      min_score: 1
    returns: score
    weight_strategy: direct_score
    derive:
      - action: boost_lens
        lens: economics
        score: 0.7
    affects:
      - context_lens
    because: Market and financial terms indicate an economic analysis framing.
    promotion: active

  - id: biology-keyword-support
    label: Biology keywords support the biology lens
    applies_to: entity
    enabled: true
    priority: 87
    function: taxonomy_score
    args:
      path: entity.domain_keyword_hits
      domain: biology
      min_score: 1
    returns: score
    weight_strategy: direct_score
    derive:
      - action: boost_lens
        lens: biology
        score: 0.7
    affects:
      - context_lens
    because: Life science terms indicate a biological classification framing.
    promotion: active

  - id: technology-keyword-support
    label: Technology keywords support the technology lens
    applies_to: entity
    enabled: true
    priority: 87
    function: taxonomy_score
    args:
      path: entity.domain_keyword_hits
      domain: technology
      min_score: 1
    returns: score
    weight_strategy: direct_score
    derive:
      - action: boost_lens
        lens: technology
        score: 0.7
    affects:
      - context_lens
    because: Computing and software terms indicate a technical systems framing.
    promotion: active

  - id: social-keyword-support
    label: Social keywords support the social lens
    applies_to: entity
    enabled: true
    priority: 87
    function: taxonomy_score
    args:
      path: entity.domain_keyword_hits
      domain: social
      min_score: 1
    returns: score
    weight_strategy: direct_score
    derive:
      - action: boost_lens
        lens: social
        score: 0.65
    affects:
      - context_lens
    because: Community and organizational terms indicate a social dynamics framing.
    promotion: active

  # --- FOUNDATION DOMAIN RULES ---

  - id: botany-keyword-support
    label: Botany keywords support the botany lens
    applies_to: entity
    enabled: true
    priority: 88
    function: taxonomy_score
    args:
      path: entity.domain_keyword_hits
      domain: botany
      min_score: 1
    returns: score
    weight_strategy: direct_score
    derive:
      - action: boost_lens
        lens: botany
        score: 0.75
    affects:
      - context_lens
    because: Root, branch, and growth terms indicate organic network structure.
    promotion: active

  - id: sound-keyword-support
    label: Sound keywords support the sound lens
    applies_to: entity
    enabled: true
    priority: 88
    function: taxonomy_score
    args:
      path: entity.domain_keyword_hits
      domain: sound
      min_score: 1
    returns: score
    weight_strategy: direct_score
    derive:
      - action: boost_lens
        lens: sound
        score: 0.75
    affects:
      - context_lens
    because: Signal, frequency, and acoustic terms indicate audio-aware data framing.
    promotion: active

  - id: structured-data-keyword-support
    label: Structured data keywords support the structured_data lens
    applies_to: entity
    enabled: true
    priority: 88
    function: taxonomy_score
    args:
      path: entity.domain_keyword_hits
      domain: structured_data
      min_score: 1
    returns: score
    weight_strategy: direct_score
    derive:
      - action: boost_lens
        lens: structured_data
        score: 0.7
    affects:
      - context_lens
    because: Schema, pipeline, and transform terms indicate data architecture framing.
    promotion: active

  - id: signal-signature-detection
    label: Signal-like data prefers flow and constellation
    applies_to: dataset
    enabled: true
    priority: 78
    function: signal_signature
    args:
      min_signal_fields: 2
    returns: score
    weight_strategy: direct_score
    derive:
      - action: boost_lens
        lens: sound
        score: 0.6
      - action: prefer_view
        view: flow
        score: 0.4
      - action: prefer_view
        view: constellation
        score: 0.35
    affects:
      - context_lens
      - view
    because: Data with signal characteristics (frequency, amplitude, phase) resonates with acoustic routing views.
    promotion: active

  - id: growth-pattern-detection
    label: Branching data prefers flow and clusters
    applies_to: dataset
    enabled: true
    priority: 77
    function: growth_pattern
    args:
      min_branch_signals: 2
    returns: score
    weight_strategy: direct_score
    derive:
      - action: boost_lens
        lens: botany
        score: 0.55
      - action: prefer_view
        view: flow
        score: 0.45
      - action: prefer_view
        view: clusters
        score: 0.3
    affects:
      - context_lens
      - view
    because: Parent-child and root-leaf patterns map naturally to tree-flow and cluster views.
    promotion: active
`;
