/**
 * TypeScript types for municipality bylaw data
 */

// Fee structure types
export interface FeeStructure {
  amount: number;
  per_sqft: boolean;
}

export interface ImpactFees {
  water?: FeeStructure;
  sewer?: FeeStructure;
  school?: FeeStructure;
  parks?: FeeStructure;
  transportation?: FeeStructure;
  [key: string]: FeeStructure | undefined;
}

export interface PermitFees {
  building_permit?: FeeStructure;
  plan_review?: FeeStructure;
  [key: string]: FeeStructure | undefined;
}

// ADU type permissions
export interface AduTypesAllowed {
  detached: boolean;
  attached: boolean;
  garage_conversion: boolean;
  basement_conversion: boolean;
  interior: boolean;
}

// Parking configuration
export interface ParkingConfiguration {
  uncovered: boolean;
  covered: boolean;
  garage: boolean;
  tandem: boolean;
  on_street: boolean;
}

// Parking exemptions
export interface ParkingExemptions {
  transit_distance_ft?: number;
  historic_district?: boolean;
  car_share_distance_ft?: number;
  on_street_available?: boolean;
  [key: string]: number | boolean | undefined;
}

// Design requirements
export interface DesignRequirements {
  matching_roof_pitch?: boolean;
  matching_siding?: boolean;
  matching_windows?: boolean;
  max_window_size_sqft?: number;
  [key: string]: boolean | number | undefined;
}

// Overlay districts
export interface OverlayDistrict {
  applicable: boolean;
  requirements?: string;
}

export interface OverlayDistricts {
  historic?: OverlayDistrict;
  environmental?: OverlayDistrict;
  coastal?: OverlayDistrict;
  flood?: OverlayDistrict;
  [key: string]: OverlayDistrict | undefined;
}

// Deed restrictions
export interface DeedRestrictions {
  required_covenant?: boolean;
  rental_restrictions?: string;
  affordability_requirements?: string;
  [key: string]: boolean | string | undefined;
}

// Main municipality bylaw data interface
export interface MunicipalityBylawData {
  id: number;
  municipality_id: number;
  
  // Basic Jurisdiction Information
  bylaw_ordinance_number?: string;
  effective_date?: string;
  last_updated: string;
  contact_department?: string;
  contact_info?: string;
  
  // Zoning Permissions
  permitted_zones: string[];
  adu_types_allowed: AduTypesAllowed;
  permit_type: 'by_right' | 'special_permit' | 'conditional_use' | 'variance';
  owner_occupancy_required: 'none' | 'primary_residence' | 'either_unit';
  
  // Lot Requirements
  min_lot_size_sqft?: number;
  min_lot_width_ft?: number;
  min_lot_depth_ft?: number;
  max_primary_dwellings: number;
  max_adus: number;
  max_total_units: number;
  
  // ADU Size Restrictions
  detached_adu_min_size_sqft?: number;
  detached_adu_max_size_sqft?: number;
  detached_adu_max_percent_of_primary?: number;
  detached_adu_max_footprint_sqft?: number;
  
  attached_adu_min_size_sqft?: number;
  attached_adu_max_size_sqft?: number;
  attached_adu_max_percent_of_primary?: number;
  
  // Height Limits
  detached_adu_max_height_ft?: number;
  detached_adu_max_stories?: number;
  attached_adu_height_rule: 'same_as_primary' | 'custom';
  attached_adu_max_height_ft?: number;
  
  // Setback Requirements for Detached ADUs
  front_setback_min_ft?: number;
  front_setback_align_with_primary: boolean;
  front_setback_behind_primary: boolean;
  
  side_setback_interior_ft?: number;
  side_setback_corner_street_ft?: number;
  side_setback_corner_interior_ft?: number;
  
  rear_setback_standard_ft?: number;
  rear_setback_with_alley_ft?: number;
  
  distance_from_primary_ft?: number;
  distance_from_other_structures_ft?: number;
  
  // Attached ADU Setbacks
  attached_adu_setback_rule: 'same_as_primary' | 'custom';
  attached_adu_setback_details?: string;
  
  // Lot Coverage
  max_lot_coverage_percent?: number;
  max_impervious_surface_percent?: number;
  min_landscaped_area_percent?: number;
  adu_coverage_counting: 'full' | 'partial' | 'exempt';
  adu_coverage_explanation?: string;
  
  // Parking Requirements
  adu_parking_spaces_required: number;
  parking_configuration_allowed: ParkingConfiguration;
  parking_exemptions: ParkingExemptions;
  driveway_min_width_ft?: number;
  driveway_max_width_ft?: number;
  driveway_material_requirements?: string;
  
  // Design Standards
  architectural_compatibility: 'must_match' | 'compatible_materials' | 'none';
  design_requirements: DesignRequirements;
  entrance_requirements: 'no_restriction' | 'cannot_face_street' | 'must_face_street' | 'separate_required';
  entrance_requirements_details?: string;
  
  // Utilities & Infrastructure
  utility_connections: 'may_share' | 'separate_required' | 'depends_on_size';
  fire_access_pathway_width_ft?: number;
  fire_access_max_distance_ft?: number;
  fire_access_special_requirements?: string;
  septic_sewer_requirements: 'public_sewer_required' | 'septic_with_capacity_proof' | 'other';
  septic_sewer_details?: string;
  
  // Fees & Charges
  impact_fees: ImpactFees;
  permit_fees: PermitFees;
  
  // Special Conditions
  overlay_districts: OverlayDistricts;
  deed_restrictions: DeedRestrictions;
  
  // Additional Notes
  additional_notes?: string;
  
  // Data Source & Validation
  source_documents: string[];
  data_entry_completed_by?: string;
  data_entry_date?: string;
  reviewed_by?: string;
  review_date?: string;
  
  // Timestamps
  created_at: string;
  updated_at: string;
}

// Form data types for creating/updating bylaw data
export interface MunicipalityBylawDataInput {
  municipality_id: number;
  bylaw_ordinance_number?: string;
  effective_date?: string;
  contact_department?: string;
  contact_info?: string;
  permitted_zones: string[];
  adu_types_allowed: AduTypesAllowed;
  permit_type: 'by_right' | 'special_permit' | 'conditional_use' | 'variance';
  owner_occupancy_required: 'none' | 'primary_residence' | 'either_unit';
  min_lot_size_sqft?: number;
  min_lot_width_ft?: number;
  min_lot_depth_ft?: number;
  max_primary_dwellings?: number;
  max_adus?: number;
  max_total_units?: number;
  detached_adu_min_size_sqft?: number;
  detached_adu_max_size_sqft?: number;
  detached_adu_max_percent_of_primary?: number;
  detached_adu_max_footprint_sqft?: number;
  attached_adu_min_size_sqft?: number;
  attached_adu_max_size_sqft?: number;
  attached_adu_max_percent_of_primary?: number;
  detached_adu_max_height_ft?: number;
  detached_adu_max_stories?: number;
  attached_adu_height_rule?: 'same_as_primary' | 'custom';
  attached_adu_max_height_ft?: number;
  front_setback_min_ft?: number;
  front_setback_align_with_primary?: boolean;
  front_setback_behind_primary?: boolean;
  side_setback_interior_ft?: number;
  side_setback_corner_street_ft?: number;
  side_setback_corner_interior_ft?: number;
  rear_setback_standard_ft?: number;
  rear_setback_with_alley_ft?: number;
  distance_from_primary_ft?: number;
  distance_from_other_structures_ft?: number;
  attached_adu_setback_rule?: 'same_as_primary' | 'custom';
  attached_adu_setback_details?: string;
  max_lot_coverage_percent?: number;
  max_impervious_surface_percent?: number;
  min_landscaped_area_percent?: number;
  adu_coverage_counting?: 'full' | 'partial' | 'exempt';
  adu_coverage_explanation?: string;
  adu_parking_spaces_required?: number;
  parking_configuration_allowed?: ParkingConfiguration;
  parking_exemptions?: ParkingExemptions;
  driveway_min_width_ft?: number;
  driveway_max_width_ft?: number;
  driveway_material_requirements?: string;
  architectural_compatibility?: 'must_match' | 'compatible_materials' | 'none';
  design_requirements?: DesignRequirements;
  entrance_requirements?: 'no_restriction' | 'cannot_face_street' | 'must_face_street' | 'separate_required';
  entrance_requirements_details?: string;
  utility_connections?: 'may_share' | 'separate_required' | 'depends_on_size';
  fire_access_pathway_width_ft?: number;
  fire_access_max_distance_ft?: number;
  fire_access_special_requirements?: string;
  septic_sewer_requirements?: 'public_sewer_required' | 'septic_with_capacity_proof' | 'other';
  septic_sewer_details?: string;
  impact_fees?: ImpactFees;
  permit_fees?: PermitFees;
  overlay_districts?: OverlayDistricts;
  deed_restrictions?: DeedRestrictions;
  additional_notes?: string;
  source_documents?: string[];
  data_entry_completed_by?: string;
  reviewed_by?: string;
}

// Municipality with bylaw data
export interface MunicipalityWithBylawData {
  id: number;
  name: string;
  website_url: string;
  status: string;
  created_at: string;
  updated_at: string;
  bylaw_data?: MunicipalityBylawData;
}

// Configurator validation result
export interface BylawValidationResult {
  isValid: boolean;
  violations: BylawViolation[];
  warnings: BylawWarning[];
}

export interface BylawViolation {
  type: 'setback' | 'size' | 'coverage' | 'height' | 'parking' | 'zoning';
  message: string;
  requirement: string;
  current_value: number | string;
  required_value: number | string;
}

export interface BylawWarning {
  type: 'recommendation' | 'consideration';
  message: string;
  details?: string;
}

// Configurator settings that can be applied from bylaw data
export interface ConfiguratorBylawSettings {
  setbacks: {
    front: number;
    rear: number;
    side: number;
  };
  aduLimits: {
    maxWidth: number;
    maxDepth: number;
    maxHeight: number;
    maxSize: number;
  };
  lotRequirements: {
    minSize: number;
    maxCoverage: number;
  };
  parkingRequired: number;
  additionalRequirements: string[];
}

// Type guards
export function isMunicipalityBylawData(obj: unknown): obj is MunicipalityBylawData {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'municipality_id' in obj &&
    'permit_type' in obj &&
    'adu_types_allowed' in obj
  );
}