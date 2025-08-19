import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase'

// GET /api/municipalities/with-bylaw-data - Get all municipalities with their bylaw data
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const hasData = url.searchParams.get('hasData') === 'true'
    
    let query = supabase
      .from('municipalities')
      .select(`
        id,
        name,
        website_url,
        status,
        created_at,
        updated_at,
        municipality_bylaw_data (
          id,
          municipality_id,
          bylaw_ordinance_number,
          effective_date,
          last_updated,
          contact_department,
          contact_info,
          permitted_zones,
          adu_types_allowed,
          permit_type,
          owner_occupancy_required,
          min_lot_size_sqft,
          min_lot_width_ft,
          min_lot_depth_ft,
          max_primary_dwellings,
          max_adus,
          max_total_units,
          detached_adu_min_size_sqft,
          detached_adu_max_size_sqft,
          detached_adu_max_percent_of_primary,
          detached_adu_max_footprint_sqft,
          attached_adu_min_size_sqft,
          attached_adu_max_size_sqft,
          attached_adu_max_percent_of_primary,
          detached_adu_max_height_ft,
          detached_adu_max_stories,
          attached_adu_height_rule,
          attached_adu_max_height_ft,
          front_setback_min_ft,
          front_setback_align_with_primary,
          front_setback_behind_primary,
          side_setback_interior_ft,
          side_setback_corner_street_ft,
          side_setback_corner_interior_ft,
          rear_setback_standard_ft,
          rear_setback_with_alley_ft,
          distance_from_primary_ft,
          distance_from_other_structures_ft,
          attached_adu_setback_rule,
          attached_adu_setback_details,
          max_lot_coverage_percent,
          max_impervious_surface_percent,
          min_landscaped_area_percent,
          adu_coverage_counting,
          adu_coverage_explanation,
          adu_parking_spaces_required,
          parking_configuration_allowed,
          parking_exemptions,
          driveway_min_width_ft,
          driveway_max_width_ft,
          driveway_material_requirements,
          architectural_compatibility,
          design_requirements,
          entrance_requirements,
          entrance_requirements_details,
          utility_connections,
          fire_access_pathway_width_ft,
          fire_access_max_distance_ft,
          fire_access_special_requirements,
          septic_sewer_requirements,
          septic_sewer_details,
          impact_fees,
          permit_fees,
          overlay_districts,
          deed_restrictions,
          additional_notes,
          source_documents,
          data_entry_completed_by,
          data_entry_date,
          reviewed_by,
          review_date,
          created_at,
          updated_at
        )
      `)
      .order('name')

    const { data: municipalities, error } = await query

    if (error) {
      console.error('Database error fetching municipalities with bylaw data:', error)
      return NextResponse.json(
        { error: 'Failed to fetch municipalities with bylaw data', details: error.message },
        { status: 500 }
      )
    }

    // Transform the data to have a cleaner structure
    const transformedData = municipalities.map(municipality => ({
      id: municipality.id,
      name: municipality.name,
      website_url: municipality.website_url,
      status: municipality.status,
      created_at: municipality.created_at,
      updated_at: municipality.updated_at,
      bylaw_data: municipality.municipality_bylaw_data?.[0] || null,
      has_bylaw_data: !!municipality.municipality_bylaw_data?.[0]
    }))

    // Filter by bylaw data presence if requested
    const filteredData = hasData 
      ? transformedData.filter(m => m.has_bylaw_data)
      : transformedData

    return NextResponse.json({
      data: filteredData,
      total: filteredData.length,
      with_bylaw_data: transformedData.filter(m => m.has_bylaw_data).length,
      without_bylaw_data: transformedData.filter(m => !m.has_bylaw_data).length
    })

  } catch (error) {
    console.error('Unexpected error in GET /api/municipalities/with-bylaw-data:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}