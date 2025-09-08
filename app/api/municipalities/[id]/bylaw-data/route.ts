import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../../lib/supabase'
import { z } from 'zod'
import type { MunicipalityBylawDataInput } from '../../../../../lib/municipality-bylaw-types'

// Validation schemas
const bylawDataSchema = z.object({
  bylaw_ordinance_number: z.union([z.string(), z.null()]).optional(),
  effective_date: z.union([z.string(), z.null()]).optional(),
  contact_department: z.union([z.string(), z.null()]).optional(),
  contact_info: z.union([z.string(), z.null()]).optional(),
  permitted_zones: z.array(z.string()).default([]),
  adu_types_allowed: z.object({
    detached: z.boolean().default(false),
    attached: z.boolean().default(false),
    garage_conversion: z.boolean().default(false),
    basement_conversion: z.boolean().default(false),
    interior: z.boolean().default(false),
  }).default({}),
  permit_type: z.enum(['by_right', 'special_permit', 'conditional_use', 'variance']).default('special_permit'),
  owner_occupancy_required: z.enum(['none', 'primary_residence', 'either_unit']).default('none'),
  
  // Lot requirements
  min_lot_size_sqft: z.union([z.number().min(0), z.null()]).optional(),
  min_lot_width_ft: z.union([z.number().min(0), z.null()]).optional(),
  min_lot_depth_ft: z.union([z.number().min(0), z.null()]).optional(),
  max_primary_dwellings: z.number().min(1).default(1),
  max_adus: z.number().min(0).default(1),
  max_total_units: z.number().min(1).default(2),
  
  // ADU size restrictions
  detached_adu_min_size_sqft: z.union([z.number().min(0), z.null()]).optional(),
  detached_adu_max_size_sqft: z.union([z.number().min(0), z.null()]).optional(),
  detached_adu_max_percent_of_primary: z.union([z.number().min(0).max(100), z.null()]).optional(),
  detached_adu_max_footprint_sqft: z.union([z.number().min(0), z.null()]).optional(),
  attached_adu_min_size_sqft: z.union([z.number().min(0), z.null()]).optional(),
  attached_adu_max_size_sqft: z.union([z.number().min(0), z.null()]).optional(),
  attached_adu_max_percent_of_primary: z.union([z.number().min(0).max(100), z.null()]).optional(),
  
  // Height limits
  detached_adu_max_height_ft: z.union([z.number().min(0), z.null()]).optional(),
  detached_adu_max_stories: z.union([z.number().min(1), z.null()]).optional(),
  attached_adu_height_rule: z.enum(['same_as_primary', 'custom']).default('same_as_primary'),
  attached_adu_max_height_ft: z.union([z.number().min(0), z.null()]).optional(),
  
  // Setbacks
  front_setback_min_ft: z.union([z.number().min(0), z.null()]).optional(),
  front_setback_align_with_primary: z.boolean().default(false),
  front_setback_behind_primary: z.boolean().default(false),
  side_setback_interior_ft: z.union([z.number().min(0), z.null()]).optional(),
  side_setback_corner_street_ft: z.union([z.number().min(0), z.null()]).optional(),
  side_setback_corner_interior_ft: z.union([z.number().min(0), z.null()]).optional(),
  rear_setback_standard_ft: z.union([z.number().min(0), z.null()]).optional(),
  rear_setback_with_alley_ft: z.union([z.number().min(0), z.null()]).optional(),
  distance_from_primary_ft: z.union([z.number().min(0), z.null()]).optional(),
  distance_from_other_structures_ft: z.union([z.number().min(0), z.null()]).optional(),
  
  // Attached ADU setbacks
  attached_adu_setback_rule: z.enum(['same_as_primary', 'custom']).default('same_as_primary'),
  attached_adu_setback_details: z.union([z.string(), z.null()]).optional(),
  
  // Lot coverage
  max_lot_coverage_percent: z.union([z.number().min(0).max(100), z.null()]).optional(),
  max_impervious_surface_percent: z.union([z.number().min(0).max(100), z.null()]).optional(),
  min_landscaped_area_percent: z.union([z.number().min(0).max(100), z.null()]).optional(),
  adu_coverage_counting: z.enum(['full', 'partial', 'exempt']).default('full'),
  adu_coverage_explanation: z.union([z.string(), z.null()]).optional(),
  
  // Parking
  adu_parking_spaces_required: z.union([z.number().min(0), z.null()]).default(1),
  parking_configuration_allowed: z.object({
    uncovered: z.boolean().default(true),
    covered: z.boolean().default(true),
    garage: z.boolean().default(true),
    tandem: z.boolean().default(false),
    on_street: z.boolean().default(false),
  }).optional(),
  parking_exemptions: z.record(z.union([z.number(), z.boolean()])).nullable().optional(),
  driveway_min_width_ft: z.union([z.number().min(0), z.null()]).optional(),
  driveway_max_width_ft: z.union([z.number().min(0), z.null()]).optional(),
  driveway_material_requirements: z.union([z.string(), z.null()]).optional(),
  
  // Design standards
  architectural_compatibility: z.enum(['must_match', 'compatible_materials', 'none']).default('none'),
  design_requirements: z.record(z.union([z.boolean(), z.number()])).nullable().optional(),
  entrance_requirements: z.enum(['no_restriction', 'cannot_face_street', 'must_face_street', 'separate_required']).default('no_restriction'),
  entrance_requirements_details: z.union([z.string(), z.null()]).optional(),
  
  // Utilities
  utility_connections: z.enum(['may_share', 'separate_required', 'depends_on_size']).default('may_share'),
  fire_access_pathway_width_ft: z.union([z.number().min(0), z.null()]).optional(),
  fire_access_max_distance_ft: z.union([z.number().min(0), z.null()]).optional(),
  fire_access_special_requirements: z.union([z.string(), z.null()]).optional(),
  septic_sewer_requirements: z.enum(['public_sewer_required', 'septic_with_capacity_proof', 'other']).default('public_sewer_required'),
  septic_sewer_details: z.union([z.string(), z.null()]).optional(),
  
  // Fees
  impact_fees: z.record(z.object({
    amount: z.number().min(0),
    per_sqft: z.boolean().default(false),
  })).nullable().optional(),
  permit_fees: z.record(z.object({
    amount: z.number().min(0),
    per_sqft: z.boolean().default(false),
  })).nullable().optional(),
  
  // Special conditions
  overlay_districts: z.record(z.object({
    applicable: z.boolean().default(false),
    requirements: z.string().optional(),
  })).nullable().optional(),
  deed_restrictions: z.record(z.union([z.boolean(), z.string()])).nullable().optional(),
  
  // Additional
  additional_notes: z.union([z.string(), z.null()]).optional(),
  source_documents: z.array(z.string()).nullable().optional(),
  data_entry_completed_by: z.union([z.string(), z.null()]).optional(),
  reviewed_by: z.union([z.string(), z.null()]).optional(),
})

// GET /api/municipalities/[id]/bylaw-data - Get bylaw data for municipality
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const municipalityId = parseInt(resolvedParams.id, 10)
    
    if (isNaN(municipalityId)) {
      return NextResponse.json(
        { error: 'Invalid municipality ID' },
        { status: 400 }
      )
    }

    // Check if municipality exists
    const { data: municipality, error: municipalityError } = await supabase
      .from('municipalities')
      .select('id, name')
      .eq('id', municipalityId)
      .single()

    if (municipalityError || !municipality) {
      return NextResponse.json(
        { error: 'Municipality not found' },
        { status: 404 }
      )
    }

    // Get bylaw data
    const { data: bylawData, error: bylawError } = await supabase
      .from('municipality_bylaw_data')
      .select('*')
      .eq('municipality_id', municipalityId)
      .single()

    if (bylawError && bylawError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      console.error('Error fetching bylaw data:', bylawError)
      return NextResponse.json(
        { error: 'Failed to fetch bylaw data' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      municipality,
      bylaw_data: bylawData || null
    })

  } catch (error) {
    console.error('Unexpected error in GET /api/municipalities/[id]/bylaw-data:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/municipalities/[id]/bylaw-data - Create bylaw data for municipality
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const municipalityId = parseInt(resolvedParams.id, 10)
    
    if (isNaN(municipalityId)) {
      return NextResponse.json(
        { error: 'Invalid municipality ID' },
        { status: 400 }
      )
    }

    const body = await request.json()
    
    const validation = bylawDataSchema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid bylaw data',
          details: validation.error.format()
        },
        { status: 400 }
      )
    }

    const validatedData = validation.data

    // Check if municipality exists
    const { data: municipality, error: municipalityError } = await supabase
      .from('municipalities')
      .select('id')
      .eq('id', municipalityId)
      .single()

    if (municipalityError || !municipality) {
      return NextResponse.json(
        { error: 'Municipality not found' },
        { status: 404 }
      )
    }

    // Check if bylaw data already exists
    const { data: existingBylawData } = await supabase
      .from('municipality_bylaw_data')
      .select('id')
      .eq('municipality_id', municipalityId)
      .single()

    if (existingBylawData) {
      return NextResponse.json(
        { error: 'Bylaw data already exists for this municipality. Use PUT to update.' },
        { status: 409 }
      )
    }

    // Create bylaw data
    const bylawDataToInsert = {
      municipality_id: municipalityId,
      ...validatedData,
      data_entry_date: new Date().toISOString().split('T')[0],
    }

    const { data: bylawData, error: insertError } = await supabase
      .from('municipality_bylaw_data')
      .insert(bylawDataToInsert)
      .select()
      .single()

    if (insertError) {
      console.error('Error creating bylaw data:', insertError)
      return NextResponse.json(
        { error: 'Failed to create bylaw data' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { 
        data: bylawData, 
        message: 'Bylaw data created successfully' 
      },
      { status: 201 }
    )

  } catch (error) {
    console.error('Unexpected error in POST /api/municipalities/[id]/bylaw-data:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/municipalities/[id]/bylaw-data - Update bylaw data for municipality
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const municipalityId = parseInt(resolvedParams.id, 10)
    
    if (isNaN(municipalityId)) {
      return NextResponse.json(
        { error: 'Invalid municipality ID' },
        { status: 400 }
      )
    }

    const body = await request.json()
    
    console.log('PUT request body received:', body)
    
    // Use partial validation to allow updating only some fields
    const validation = bylawDataSchema.partial().safeParse(body)
    
    if (!validation.success) {
      console.error('PUT validation failed:', validation.error.format())
      console.error('Validation issues:', validation.error.issues)
      return NextResponse.json(
        { 
          error: 'Invalid bylaw data',
          details: validation.error.format(),
          issues: validation.error.issues
        },
        { status: 400 }
      )
    }

    const validatedData = validation.data

    // Check if bylaw data exists
    const { data: existingBylawData, error: fetchError } = await supabase
      .from('municipality_bylaw_data')
      .select('id')
      .eq('municipality_id', municipalityId)
      .single()

    if (fetchError || !existingBylawData) {
      return NextResponse.json(
        { error: 'Bylaw data not found for this municipality' },
        { status: 404 }
      )
    }

    // Update bylaw data - validation.data will include null values
    const { data: bylawData, error: updateError } = await supabase
      .from('municipality_bylaw_data')
      .update(validation.data)
      .eq('municipality_id', municipalityId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating bylaw data:', updateError)
      return NextResponse.json(
        { error: 'Failed to update bylaw data' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { 
        data: bylawData, 
        message: 'Bylaw data updated successfully' 
      },
      { status: 200 }
    )

  } catch (error) {
    console.error('Unexpected error in PUT /api/municipalities/[id]/bylaw-data:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/municipalities/[id]/bylaw-data - Delete bylaw data for municipality
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const municipalityId = parseInt(resolvedParams.id, 10)
    
    if (isNaN(municipalityId)) {
      return NextResponse.json(
        { error: 'Invalid municipality ID' },
        { status: 400 }
      )
    }

    // Check if bylaw data exists
    const { data: existingBylawData, error: fetchError } = await supabase
      .from('municipality_bylaw_data')
      .select('id')
      .eq('municipality_id', municipalityId)
      .single()

    if (fetchError || !existingBylawData) {
      return NextResponse.json(
        { error: 'Bylaw data not found for this municipality' },
        { status: 404 }
      )
    }

    // Delete bylaw data
    const { error: deleteError } = await supabase
      .from('municipality_bylaw_data')
      .delete()
      .eq('municipality_id', municipalityId)

    if (deleteError) {
      console.error('Error deleting bylaw data:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete bylaw data' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { message: 'Bylaw data deleted successfully' },
      { status: 200 }
    )

  } catch (error) {
    console.error('Unexpected error in DELETE /api/municipalities/[id]/bylaw-data:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}