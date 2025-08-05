#!/usr/bin/env node

/**
 * Apply the many-to-many scraper assignment migration
 * This script executes the database migration to add assigned_scrapers and active_scraper columns
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error(`   NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? '✓' : '✗'}`);
  console.error(`   SUPABASE_SERVICE_ROLE_KEY: ${supabaseServiceKey ? '✓' : '✗'}`);
  process.exit(1);
}

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  console.log('🚀 Starting database migration for many-to-many scraper assignments...');
  
  try {
    // Step 1: Add new columns
    console.log('📝 Adding new columns to municipalities table...');
    const { error: alterError } = await supabase.rpc('exec_sql', {
      query: `
        ALTER TABLE municipalities 
        ADD COLUMN IF NOT EXISTS assigned_scrapers TEXT[] DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS active_scraper TEXT;
      `
    });

    if (alterError) {
      // Try direct SQL execution instead
      const { error: directAlterError } = await supabase
        .from('municipalities')
        .select('assigned_scrapers')
        .limit(1);
      
      if (directAlterError && directAlterError.message.includes('does not exist')) {
        console.log('⚠️  Columns do not exist. Need to apply migration manually via Supabase dashboard.');
        
        // Output the migration SQL for manual execution
        console.log('\n📋 Please execute this SQL in the Supabase dashboard:');
        console.log('─'.repeat(60));
        const migrationPath = path.join(__dirname, '..', 'migrations', '20250105_add_many_to_many_scrapers.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        console.log(migrationSQL);
        console.log('─'.repeat(60));
        return;
      }
    }

    // Step 2: Migrate existing data
    console.log('🔄 Migrating existing scraper_name data to new structure...');
    const { error: updateError } = await supabase.rpc('exec_sql', {
      query: `
        UPDATE municipalities 
        SET 
          assigned_scrapers = CASE 
            WHEN scraper_name IS NOT NULL THEN ARRAY[scraper_name]
            ELSE '{}'::TEXT[]
          END,
          active_scraper = scraper_name
        WHERE assigned_scrapers IS NULL OR assigned_scrapers = '{}';
      `
    });

    if (updateError) {
      console.error('❌ Error migrating data:', updateError);
      return;
    }

    // Step 3: Create indexes
    console.log('📊 Creating indexes for optimal performance...');
    const { error: indexError } = await supabase.rpc('exec_sql', {
      query: `
        CREATE INDEX IF NOT EXISTS idx_municipalities_assigned_scrapers 
        ON municipalities USING GIN (assigned_scrapers);
        
        CREATE INDEX IF NOT EXISTS idx_municipalities_active_scraper 
        ON municipalities (active_scraper);
      `
    });

    if (indexError) {
      console.log('⚠️  Index creation failed (may already exist):', indexError.message);
    }

    // Step 4: Verify migration
    console.log('✅ Verifying migration results...');
    const { data: municipalities, error: selectError } = await supabase
      .from('municipalities')
      .select('id, name, scraper_name, assigned_scrapers, active_scraper')
      .limit(5);

    if (selectError) {
      console.error('❌ Error verifying migration:', selectError);
      return;
    }

    console.log('\n📊 Migration Results:');
    console.log('─'.repeat(80));
    municipalities.forEach(m => {
      console.log(`${m.name}:`);
      console.log(`  Old: scraper_name = ${m.scraper_name || 'null'}`);
      console.log(`  New: assigned_scrapers = ${JSON.stringify(m.assigned_scrapers)}`);
      console.log(`  New: active_scraper = ${m.active_scraper || 'null'}`);
      console.log('');
    });

    console.log('✅ Migration completed successfully!');
    console.log('🎉 Many-to-many scraper assignments are now active.');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  applyMigration().then(() => {
    console.log('🏁 Migration script completed.');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { applyMigration };