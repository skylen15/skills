#!/usr/bin/env node
/* ============================================================================
 * ServiceNow Schema Exporter — Node.js Extractor
 * ============================================================================
 *
 * Pulls the seven schema-source tables from a ServiceNow instance via the
 * standard Table API (Basic auth or API key) and feeds them through SchemaBuilder to
 * produce viewer-ready JSON (or an alternative ML-friendly format).
 *
 * Usage:
 *   node sn-schema-export.node.js \
 *     --instance=https://your-instance.service-now.com \
 *     --user=admin --password=***             (Basic Auth)
 *     --apikey=<sn_api_key>                   (API key — alternative to user/password)
 *     --output=schema.json \
 *     [--format=json|markdown|jsonld|owl|openapi]  (default: json)
 *     [--edge-types=reference,extends,m2m,rel,view,cmdb_rel]  (default: all six)
 *     [--include-record-counts] \
 *     [--page-size=N] \
 *     [--pretty] [--verbose]
 *
 * Environment variable alternatives:
 *   SN_INSTANCE, SN_USER, SN_PASSWORD, SN_APIKEY, SN_OUTPUT, SN_PAGE_SIZE,
 *   SN_FORMAT, SN_EDGE_TYPES
 *
 * Performance
 * -----------
 *   Paginates with sysparm_limit=1000 (default; override with --page-size or
 *   SN_PAGE_SIZE) and parallelises the eight table fetches.
 *   On a typical instance: 60-120 seconds.
 * ============================================================================ */

'use strict';

const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');
const { URL } = require('url');
// ── INLINED SchemaBuilder (see https://github.com/.../shared/schema-builder.js for source) ──
const SchemaBuilder = (function(){ const module = { exports: {} }; 
/* ============================================================================
 * SchemaBuilder — shared core for the ServiceNow schema exporter
 * ============================================================================
 *
 * Pure transformation function. Takes the seven source-table arrays (already
 * fetched from sys_db_object, sys_dictionary, sys_m2m, sys_db_view,
 * sys_db_view_table, sys_relationship, sys_glide_object) and returns the
 * viewer-ready JSON.
 *
 * Designed to run identically in:
 *   • ServiceNow Background Scripts (server-side Rhino/JS)
 *   • Node.js extractor (standard JS)
 *
 * Therefore: NO server-side dependencies (no GlideRecord, no gs.*), NO modern
 * Node-only APIs. Plain ES5-compatible JavaScript, callable as either a CommonJS
 * module (Node) or a global variable (background script).
 *
 * Performance characteristics
 * ---------------------------
 *   • Zero nested loops over the full edge/field sets. Everything works through
 *     pre-built Maps keyed by table name.
 *   • Single pass over each input array.
 *   • Total complexity: O(T + F + R + V + VT + M + G) where the inputs are
 *     tables, fields, relationships, views, view-table-members, m2m, glide-types.
 *
 * Input shape (each item is a plain object — what the source table's columns
 * look like after JSON conversion). All `*Ref` fields are { name, displayValue }
 * objects so display names survive even when the link is broken.
 *
 *   sysDbObject:    [{ sys_id, name, label, super_class:{name,displayValue},
 *                      sys_scope:{name,displayValue}, is_extendable, access,
 *                      ws_access, scriptable_table }]
 *   sysDictionary:  [{ sys_id, name (table), element (field), column_label,
 *                      internal_type:{value,displayValue},
 *                      reference:{name,displayValue}, max_length, mandatory,
 *                      primary,
 *                      virtual, active  ← carried through as-is for future use;
 *                                         build() does not currently consume them }]
 *   sysM2m:         [{ sys_id, from_table, to_table, m2m_table,
 *                      m2m_from_field, m2m_to_field,
 *                      m2m_from_label, m2m_to_label }]
 *   sysDbView:      [{ sys_id, name, label, description, plural }]
 *   sysDbViewTable: [{ sys_id, view:{name,displayValue}, table, order,
 *                      left_join, where_clause, variable_prefix, active }]
 *   sysRelationship:[{ sys_id, name, query_from, query_with, apply_to,
 *                      basic_query_from, basic_apply_to, advanced }]
 *   sysGlideObject: [{ sys_id, name, label, scalar_type, scalar_length,
 *                      class_name, visible, attributes }]
 *   cmdbRelTypeSuggest: [{ base_class, dependent_class,
 *                          parent (boolean — true means base_class is parent),
 *                          rel_type_display }]
 *     The class-level "suggested relationships" catalog from
 *     `cmdb_rel_type_suggest`. SchemaBuilder dedupes mirror entries (same
 *     logical relationship recorded from both sides) and emits a clean
 *     parent→child list as `_ciRelationships` in the output.
 *
 * Output shape — see the README for full schema. Backward compatible with the
 * existing viewer's `{nodes, edges}` model; new top-level fields are silently
 * ignored by older builds.
 * ============================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // Node.js / CommonJS
    module.exports = factory();
  } else {
    // Browser / Rhino / ServiceNow server-side: attach to whatever global
    // we can find. Rhino's top-level `this` is the global object when the
    // function is called without an explicit receiver, which is what
    // happens here (the IIFE is invoked as `(function(){})(root,fn)`).
    root.SchemaBuilder = factory();
  }
})(
  // Determine the global object across environments.
  // - Node:    `global`
  // - Browser: `self` (or `window`)
  // - Rhino:   the top-level `this` resolves to the global scope
  (typeof globalThis !== 'undefined') ? globalThis :
  (typeof self !== 'undefined')       ? self :
  (typeof global !== 'undefined')     ? global :
  this,
  function () {

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function ref(name, displayValue) {
    // Normalise the {name, displayValue} ref shape. Strips empties.
    if (!name && !displayValue) return null;
    return { name: name || '', displayValue: displayValue || name || '' };
  }

  /**
   * Try to extract a target-table name from a sys_relationship row whose
   * `query_from` is a script blob. We look for the common pattern:
   *   answer = "<table>";   answer = '<table>';   answer="<table>";
   * Returns the table name on a confident match, or null.
   * Anything more dynamic (concatenation, variable lookup, conditional)
   * is flagged as scripted and surfaced separately rather than guessed.
   */
  function parseRelationshipTargetTable(queryFrom) {
    if (!queryFrom || typeof queryFrom !== 'string') return null;
    // Strip CDATA wrappers if present (some sources include them)
    var q = queryFrom.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
    // Single line, simple assignment to a string literal — confident match
    var m = q.match(/^\s*answer\s*=\s*['"]([a-z_][a-z0-9_]*)['"]\s*;?\s*$/i);
    if (m) return m[1];
    // Allow whitespace + var/let declarations around it (still simple)
    m = q.match(/^\s*(?:var|let|const)?\s*answer\s*=\s*['"]([a-z_][a-z0-9_]*)['"]\s*;?\s*$/i);
    if (m) return m[1];
    return null; // dynamic — surface but don't pretend to know
  }

  /**
   * Best-effort parse of `basic_apply_to` to figure out which source tables
   * this scripted relationship applies to. Same conservative approach.
   */
  function parseRelationshipApplyTable(applyTo, basicApplyTo) {
    // basic_apply_to is often the plain table name when the script is simple
    if (basicApplyTo && /^[a-z_][a-z0-9_]*$/i.test(basicApplyTo)) return basicApplyTo;
    if (!applyTo || typeof applyTo !== 'string') return null;
    var a = applyTo.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
    var m = a.match(/^\s*answer\s*=\s*['"]([a-z_][a-z0-9_]*)['"]\s*;?\s*$/i);
    return m ? m[1] : null;
  }

  // ── Main build function ─────────────────────────────────────────────────────
  function build(input, options) {
    options = options || {};
    var startedAt = new Date();
    var t0 = Date.now();

    var sysDbObject    = input.sysDbObject    || [];
    var sysDictionary  = input.sysDictionary  || [];
    var sysM2m         = input.sysM2m         || [];
    var sysDbView      = input.sysDbView      || [];
    var sysDbViewTable = input.sysDbViewTable || [];
    var sysRelation    = input.sysRelationship || [];
    var sysGlideObject = input.sysGlideObject || [];
    var cmdbRelTypeSuggest = input.cmdbRelTypeSuggest || [];
    var recordCounts   = input.recordCounts   || null; // Map<tableName, integer|null> or null
    // Failures captured per-table during record-count collection. Allows the
    // exporter to distinguish "no count requested" from "count attempted and
    // failed", and to bucket failures by category (acl / unsupported / script
    // error). Map<tableName, {category, message}> or null.
    var recordCountFailures = input.recordCountFailures || null;

    // ── 1. Build the table index (sys_db_object) ────────────────────────────
    // Maps that downstream stages use to resolve table identity, label, scope.
    // Key is the technical name (column `name`), which is the natural join key
    // everywhere else in the schema.
    var tableByName = {};      // name -> node-in-progress
    var extendableSet = {};    // name -> true   (for cheap lookup in field stage)
    var packagePrivate = [];   // names of tables with access='package_private'
    for (var i = 0; i < sysDbObject.length; i++) {
      var t = sysDbObject[i];
      if (!t.name) continue;
      tableByName[t.name] = {
        id:     t.name,
        label:  t.label || t.name,
        scope:  (t.sys_scope && t.sys_scope.displayValue) || 'Global',
        access: t.access || null,
        // Note: super (parent) is set in the extends-edge stage below so that we
        // capture all extends edges in a single edge-emission spot.
        // Fields are populated in stage 2.
        fields: []
        // _isView, _isExtendable etc. are added on the fly.
      };
      if (t.is_extendable === true || t.is_extendable === 'true') {
        extendableSet[t.name] = true;
        tableByName[t.name]._isExtendable = true;
      }
      // ws_access=false means the table is not accessible via the Table API / REST.
      // Only flagged when explicitly false; absence means accessible (the default).
      if (t.ws_access === false) {
        tableByName[t.name].ws_access = false;
      }
      if (t.access === 'package_private') {
        packagePrivate.push(t.name);
      }
    }

    // Database views become nodes too, marked with _isView so the viewer can
    // style them differently from regular tables. View members are emitted as
    // edges in the view-edge stage below.
    for (var iv = 0; iv < sysDbView.length; iv++) {
      var v = sysDbView[iv];
      if (!v.name) continue;
      // It's legal for a view name to also exist as a regular table name; in
      // practice ServiceNow keeps these disjoint. If a collision happens, the
      // regular table wins (already in the map) and the view is annotated.
      if (tableByName[v.name]) {
        tableByName[v.name]._isView = true;
        continue;
      }
      tableByName[v.name] = {
        id:     v.name,
        label:  v.label || v.name,
        scope:  'Global',
        fields: [],
        _isView: true
      };
    }

    // ── 2. Build fields per table (sys_dictionary) ──────────────────────────
    // We iterate sys_dictionary ONCE. Rows where `element` is empty are the
    // table-level config rows (no field) and are skipped here — sys_db_object
    // gives us everything we need at that level. We also collect reference
    // edges as we go, since each one is uniquely derived from a dictionary row.
    // fieldSeen and refEdgeSeen guard against duplicate input rows (e.g. from
    // unstable Table API pagination returning a boundary row on two consecutive
    // pages, or GlideRecord returning a row twice under certain index conditions).
    var fieldSeen = {};    // tableName → { elementName: true }
    var refEdgeSeen = {};  // "table\x01field" → true
    var referenceEdges = []; // { source, target, type:'reference', field, label }
    for (var id = 0; id < sysDictionary.length; id++) {
      var d = sysDictionary[id];
      if (!d.name || !d.element) continue; // skip table-level rows
      var tableNode = tableByName[d.name];
      if (!tableNode) continue; // dictionary row for a table not in sys_db_object — skip

      // Deduplicate: skip if we've already processed this (table, element) pair
      if (!fieldSeen[d.name]) fieldSeen[d.name] = {};
      if (fieldSeen[d.name][d.element]) continue;
      fieldSeen[d.name][d.element] = true;

      var typeValue = (d.internal_type && d.internal_type.value) || 'string';
      var typeLabel = (d.internal_type && d.internal_type.displayValue) || typeValue;

      tableNode.fields.push({
        name:        d.element,
        label:       d.column_label || d.element,
        type:        typeValue,
        typeLabel:   typeLabel,
        mandatory:   d.mandatory === true || d.mandatory === 'true',
        maxLength:   d.max_length ? parseInt(d.max_length, 10) : null,
        primary:     d.primary === true || d.primary === 'true',
        // We don't ship `virtual`/`array`/`audit`/etc. by default — viewer
        // doesn't surface them. They can be added later via options.includeFlags.
        reference:   (d.reference && d.reference.name) || null
      });

      // Reference edges — only when there's a real target table
      if (d.internal_type && (typeValue === 'reference' || typeValue === 'glide_list')) {
        var refTarget = d.reference && d.reference.name;
        if (refTarget && tableByName[refTarget]) {
          var refKey = d.name + '\x01' + d.element;
          if (!refEdgeSeen[refKey]) {
            refEdgeSeen[refKey] = true;
            referenceEdges.push({
              source: d.name,
              target: refTarget,
              type:   'reference',
              field:  d.element,
              label:  d.column_label || d.element
            });
          }
        }
      }
    }

    // ── 3. Build extends edges (sys_db_object.super_class) ──────────────────
    var extendsEdges = [];
    var extendsSeen = {}; // tableName → true (each table can extend at most one parent)
    for (var ix = 0; ix < sysDbObject.length; ix++) {
      var tx = sysDbObject[ix];
      if (!tx.name) continue;
      var parent = tx.super_class && tx.super_class.name;
      if (!parent || !tableByName[parent]) continue;
      if (extendsSeen[tx.name]) continue; // duplicate sysDbObject row — skip
      extendsSeen[tx.name] = true;
      extendsEdges.push({
        source: tx.name,
        target: parent,
        type:   'extends',
        label:  'extends'
      });
    }

    // ── 4. Build m2m edges (sys_m2m) ────────────────────────────────────────
    // We emit one logical edge from→to per row, annotated with the junction
    // table name so the viewer (or downstream tooling) can drill in if needed.
    // The from_table / to_table fields can occasionally reference a table that
    // isn't in our index (orphaned m2m rows from uninstalled plugins) — we skip
    // those silently.
    var m2mEdges = [];
    for (var im = 0; im < sysM2m.length; im++) {
      var mm = sysM2m[im];
      if (!mm.from_table || !mm.to_table) continue;
      if (!tableByName[mm.from_table] || !tableByName[mm.to_table]) continue;
      m2mEdges.push({
        source:  mm.from_table,
        target:  mm.to_table,
        type:    'm2m',
        label:   mm.m2m_to_label || mm.m2m_from_label || mm.m2m_table || '',
        viaTable:    mm.m2m_table || null,
        fromField:   mm.m2m_from_field || null,
        toField:     mm.m2m_to_field || null
      });
    }

    // ── 5. Build view edges (sys_db_view_table → sys_db_view) ───────────────
    // Each view-table-member row becomes a "view" edge from the view node to
    // the member table. We carry order + where_clause + variable_prefix so the
    // viewer / downstream tools can reconstruct the join.
    var viewEdges = [];
    for (var iw = 0; iw < sysDbViewTable.length; iw++) {
      var vt = sysDbViewTable[iw];
      var viewName = vt.view && vt.view.displayValue ? vt.view.displayValue :
                     (vt.view && vt.view.name ? vt.view.name : null);
      // The view ref shows up as displayValue=name on view-table-member rows,
      // since the value in storage is the sys_id. We rely on viewName already
      // being the view's technical name in the data shape produced by the
      // fetchers.
      if (!viewName || !vt.table) continue;
      if (!tableByName[viewName] || !tableByName[vt.table]) continue;
      viewEdges.push({
        source:  viewName,
        target:  vt.table,
        type:    'view',
        label:   vt.variable_prefix ? ('as ' + vt.variable_prefix) : '',
        order:        vt.order != null ? parseInt(vt.order, 10) : null,
        leftJoin:     vt.left_join === true || vt.left_join === 'true',
        whereClause:  vt.where_clause || ''
      });
    }

    // ── 6. Build named-relationship edges (sys_relationship) ────────────────
    // sys_relationship is the dirtiest input. Many rows compute their target
    // table dynamically in a script. We do best-effort static parsing; when
    // we can't be confident we still emit the relationship as a "rel" edge
    // but mark _scripted=true and ship the script body so the viewer can
    // surface it informationally.
    var relEdges = [];
    for (var ir = 0; ir < sysRelation.length; ir++) {
      var rr = sysRelation[ir];
      if (!rr.name) continue;
      var fromTable = parseRelationshipApplyTable(rr.apply_to, rr.basic_apply_to);
      var toTable   = parseRelationshipTargetTable(rr.query_from) ||
                      (rr.basic_query_from && /^[a-z_][a-z0-9_]*$/i.test(rr.basic_query_from)
                         ? rr.basic_query_from : null);
      var scripted  = !(fromTable && toTable);

      // We only emit edges where BOTH endpoints resolve to known tables;
      // dangling endpoints aren't drawable. The script body is still kept
      // on the edge so a future viewer can surface the relationship even
      // if one side is dynamic.
      if (fromTable && toTable && tableByName[fromTable] && tableByName[toTable]) {
        relEdges.push({
          source:    fromTable,
          target:    toTable,
          type:      'rel',
          label:     rr.name,
          _scripted: scripted,
          _scriptQueryFrom: rr.query_from || '',
          _scriptQueryWith: rr.query_with || '',
          _scriptApplyTo:   rr.apply_to   || ''
        });
      }
    }

    // ── 7. Assemble final node and edge lists ───────────────────────────────
    var nodes = [];
    for (var key in tableByName) {
      if (!Object.prototype.hasOwnProperty.call(tableByName, key)) continue;
      var node = tableByName[key];
      // Attach record count if provided AND non-null. A null entry means the
      // exporter attempted a count but the table returned an error (ACL, vtable
      // bug, unsupported aggregate). We omit the field rather than write 0,
      // since 0 has a real meaning (table exists but is empty).
      if (recordCounts && Object.prototype.hasOwnProperty.call(recordCounts, key)) {
        var rc = recordCounts[key];
        if (rc !== null && rc !== undefined) node.recordCount = rc;
      }
      // If a count failure was recorded, surface its category on the node so
      // the viewer can render "unavailable (acl)" etc.
      if (recordCountFailures && Object.prototype.hasOwnProperty.call(recordCountFailures, key)) {
        node.recordCountStatus = recordCountFailures[key].category;
      }
      nodes.push(node);
    }

    var edges = []
      .concat(extendsEdges)
      .concat(referenceEdges)
      .concat(m2mEdges)
      .concat(viewEdges)
      .concat(relEdges);

    // ── 8. Type catalog (sys_glide_object) ──────────────────────────────────
    // Keyed by internal type name. The viewer hashes unknowns; this map lets
    // it look up the human label and base scalar type for known ones.
    var typeCatalog = {};
    for (var ig = 0; ig < sysGlideObject.length; ig++) {
      var go = sysGlideObject[ig];
      if (!go.name) continue;
      typeCatalog[go.name] = {
        label:        go.label || go.name,
        scalarType:   go.scalar_type || null,
        scalarLength: go.scalar_length ? parseInt(go.scalar_length, 10) : null,
        className:    go.class_name || null,
        visible:      go.visible === true || go.visible === 'true',
        attributes:   go.attributes || ''
      };
    }

    // ── 9. Compute summary stats ────────────────────────────────────────────
    var scopeCounts = {};
    var fieldTotal = 0;
    var tablesWithRefs = 0;
    var deepestChain = 0;
    var refSourceTables = {};
    for (var ie = 0; ie < referenceEdges.length; ie++) refSourceTables[referenceEdges[ie].source] = true;

    // Build a parent-lookup map and compute deepest extends chain by memoised DFS
    var parentMap = {};
    for (var iex = 0; iex < extendsEdges.length; iex++) parentMap[extendsEdges[iex].source] = extendsEdges[iex].target;
    var depthCache = {};
    function depthOf(name) {
      if (depthCache[name] != null) return depthCache[name];
      var parent = parentMap[name];
      var d = parent ? (1 + depthOf(parent)) : 0;
      depthCache[name] = d;
      return d;
    }

    var viewNodeCount = 0;
    for (var iz = 0; iz < nodes.length; iz++) {
      var n = nodes[iz];
      // All nodes (tables and views) contribute to scope counts.
      scopeCounts[n.scope] = (scopeCounts[n.scope] || 0) + 1;
      if (n._isView) { viewNodeCount++; continue; } // skip view-specific stats below
      fieldTotal += n.fields.length;
      if (refSourceTables[n.id]) tablesWithRefs++;
      var d = depthOf(n.id);
      if (d > deepestChain) deepestChain = d;
    }

    var pureTableCount = nodes.length - viewNodeCount; // sys_db_object tables only, excludes sys_db_view nodes

    var counts = {
      tables:                 pureTableCount,          // real tables only; DB views counted separately below
      fields:                 fieldTotal,
      references:             referenceEdges.length,
      m2m_relationships:      m2mEdges.length,
      db_views:               sysDbView.length,
      view_members:           viewEdges.length,
      named_relationships:    relEdges.length,
      extends_edges:          extendsEdges.length,
      unique_scopes:          Object.keys(scopeCounts).length,
      type_catalog_entries:   Object.keys(typeCatalog).length,
      package_private_tables: packagePrivate.length
    };
    var coverage = {
      tables_with_references:        tablesWithRefs,
      tables_with_references_pct:    pureTableCount ? +(100 * tablesWithRefs / pureTableCount).toFixed(1) : 0,
      avg_fields_per_table:          pureTableCount ? +(fieldTotal / pureTableCount).toFixed(1) : 0,
      deepest_inheritance_chain:     deepestChain
    };

    var elapsedMs = Date.now() - t0;

    // ── 10. Assemble final output ───────────────────────────────────────────
    // Build a structured _capabilities.recordCounts. The viewer reads this to
    // gate UI (e.g. show "—" instead of "0" for tables with status=acl).
    var recordCountsCap;
    if (!recordCounts) {
      recordCountsCap = { enabled: false };
    } else {
      var attempted = 0, succeeded = 0;
      for (var rcKey in recordCounts) {
        if (!Object.prototype.hasOwnProperty.call(recordCounts, rcKey)) continue;
        attempted++;
        if (recordCounts[rcKey] !== null && recordCounts[rcKey] !== undefined) succeeded++;
      }
      var failureBreakdown = { acl: 0, unsupported: 0, script_error: 0, other: 0 };
      var failedTables = [];
      if (recordCountFailures) {
        for (var fk in recordCountFailures) {
          if (!Object.prototype.hasOwnProperty.call(recordCountFailures, fk)) continue;
          var f = recordCountFailures[fk];
          var cat = f && f.category ? f.category : 'other';
          if (!Object.prototype.hasOwnProperty.call(failureBreakdown, cat)) cat = 'other';
          failureBreakdown[cat]++;
          failedTables.push(fk);
        }
      }
      recordCountsCap = {
        enabled:      true,
        partial:      failedTables.length > 0,
        attempted:    attempted,
        succeeded:    succeeded,
        failedCount:  failedTables.length,
        failuresByCategory: failureBreakdown
      };
    }

    // ── CI topology relationships from cmdb_rel_type_suggest ────────────
    // Each input row tells us: classes (base, dependent), the relationship
    // type ("Contains::Contained by"), and whether base_class plays the
    // parent role. The same logical relationship is often recorded twice
    // — once from each side's perspective — so we dedupe.
    //
    // Dedup key: sorted (parent, child, relTypeDisplay). The parent-direction
    // row is canonical; if only the child-direction row exists for some
    // pair we still capture it (and swap fields so parent is the parent).
    var ciRelMap = {};
    for (var iCr = 0; iCr < cmdbRelTypeSuggest.length; iCr++) {
      var cr = cmdbRelTypeSuggest[iCr];
      if (!cr || !cr.base_class || !cr.dependent_class || !cr.rel_type_display) continue;
      // Determine parent/child from the boolean
      var parentClass, childClass;
      if (cr.parent === true || cr.parent === 'true') {
        parentClass = cr.base_class;
        childClass  = cr.dependent_class;
      } else {
        parentClass = cr.dependent_class;
        childClass  = cr.base_class;
      }
      // Split "Contains::Contained by" into parent-verb / child-verb
      var verbs = String(cr.rel_type_display).split('::');
      var parentVerb = verbs[0] || cr.rel_type_display;
      var childVerb  = verbs[1] || verbs[0] || cr.rel_type_display;
      var key = parentClass + '\u0001' + childClass + '\u0001' + cr.rel_type_display;
      if (!ciRelMap[key]) {
        ciRelMap[key] = {
          parentClass: parentClass,
          childClass:  childClass,
          parentLabel: parentVerb,   // verb when parent is the focused CI ("Contains")
          childLabel:  childVerb,    // verb when child is the focused CI ("Contained by")
          relTypeDisplay: cr.rel_type_display
        };
      }
    }
    var ciRelationships = [];
    for (var crKey in ciRelMap) {
      if (Object.prototype.hasOwnProperty.call(ciRelMap, crKey)) {
        ciRelationships.push(ciRelMap[crKey]);
      }
    }
    // Sort for deterministic output: by parent class, then child class, then type
    ciRelationships.sort(function (a, b) {
      var pa = String(a.parentClass), pb = String(b.parentClass);
      if (pa !== pb) return pa < pb ? -1 : 1;
      var ca = String(a.childClass), cb = String(b.childClass);
      if (ca !== cb) return ca < cb ? -1 : 1;
      return String(a.relTypeDisplay) < String(b.relTypeDisplay) ? -1 : 1;
    });
    // Back-fill into counts — ciRelationships isn't available when counts is first built
    counts.ci_relationships = ciRelationships.length;

    var output = {
      _schema_version: 1,
      _instance: input.instance || {},
      _stats: { counts: counts, coverage: coverage, scopes: scopeCounts },
      _capabilities: {
        recordCounts:           recordCountsCap,
        namedRelationshipsParsed: 'static-with-script-fallback',
        scriptedRelationshipsIncluded: true,
        ciRelationshipsIncluded: ciRelationships.length > 0
      },
      _typeCatalog: typeCatalog,
      // Tables with sys_db_object.access='package_private' are only accessible
      // from within their own scope. Table API callers from other scopes will not
      // see these tables or their field definitions. Background-script exports
      // capture them because they run as admin; this list lets consumers
      // pre-identify expected gaps when comparing against a Table API export.
      _restrictedHints: { packagePrivateTables: packagePrivate },
      _ciRelationships: ciRelationships,
      _build: {
        startedAt: startedAt.toISOString ? startedAt.toISOString() : String(startedAt),
        elapsedMs: elapsedMs,
        builderVersion: '2.0.0'
      },
      nodes: nodes,
      edges: edges
    };
    return output;
  }

  /**
   * Streaming serialiser. Produces the SAME JSON shape that JSON.stringify(build(input))
   * would, but emits it as many small writes via writeFn(chunkString) so no single
   * intermediate string exceeds the runtime's string-size cap (Rhino: 32 MB).
   *
   * Behaviour matches build() exactly — same fields, same ordering, same nested
   * structures. Only the serialisation strategy differs. All future schema
   * additions automatically flow through because we delegate per-element to
   * JSON.stringify (each node/edge fits easily under the cap).
   *
   * @param {Object}   input    Same input shape as build()
   * @param {Function} writeFn  Called with each JSON chunk (string). Must not throw.
   * @return {Object}           Summary of what was emitted: { counts, sizeBytes, elapsedMs }
   *                            (no big strings — counts only — safe under cap)
   */
  function buildStreaming(input, writeFn) {
    // We reuse build() to construct the full in-memory object graph. The 32 MB
    // limit is on STRINGS in Rhino, not on heap object size, so this is fine.
    var schema = build(input);
    var totalBytes = 0;

    function emit(chunk) {
      writeFn(chunk);
      totalBytes += chunk.length;
    }

    // Helper: emit a JSON-stringified value as a single chunk. Used for the
    // small header sections (each fits comfortably under the cap on its own).
    function emitJSON(value) {
      emit(JSON.stringify(value));
    }

    // Helper: emit one element of an array, with comma prefix for all but first.
    function emitArrayItem(value, isFirst) {
      if (!isFirst) emit(',');
      emit(JSON.stringify(value));
    }

    // ── Stream the JSON document ────────────────────────────────────────────
    // Header — write the document opening and all small top-level objects.
    emit('{"_schema_version":');
    emitJSON(schema._schema_version);
    emit(',"_instance":');
    emitJSON(schema._instance);
    emit(',"_stats":');
    emitJSON(schema._stats);
    emit(',"_capabilities":');
    emitJSON(schema._capabilities);
    emit(',"_typeCatalog":');
    emitJSON(schema._typeCatalog);
    emit(',"_restrictedHints":');
    emitJSON(schema._restrictedHints);
    emit(',"_ciRelationships":');
    emitJSON(schema._ciRelationships);
    emit(',"_build":');
    emitJSON(schema._build);

    // Nodes — one per write. Even a 200-field table serialises to <100 KB,
    // well under the 32 MB cap. This is where the bulk of the payload lives.
    emit(',"nodes":[');
    for (var i = 0; i < schema.nodes.length; i++) {
      emitArrayItem(schema.nodes[i], i === 0);
    }
    emit(']');

    // Edges — same treatment. Per-edge payloads stay small even when scripted
    // sys_relationship bodies are attached.
    emit(',"edges":[');
    for (var j = 0; j < schema.edges.length; j++) {
      emitArrayItem(schema.edges[j], j === 0);
    }
    emit(']');

    emit('}');

    return {
      counts:    schema._stats.counts,
      sizeBytes: totalBytes,
      elapsedMs: schema._build.elapsedMs
    };
  }

  return {
    build:          build,
    buildStreaming: buildStreaming,
    _internal: {
      parseRelationshipTargetTable: parseRelationshipTargetTable,
      parseRelationshipApplyTable:  parseRelationshipApplyTable
    }
  };
});

return module.exports; })();

// ─── CLI parsing ──────────────────────────────────────────────────────────
function parseArgs(argv) {
    const out = { _: [] };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const eq = a.indexOf('=');
            if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
            else out[a.slice(2)] = true;
        } else out._.push(a);
    }
    return out;
}
const args = parseArgs(process.argv);

const ALL_EDGE_TYPES = ['reference', 'extends', 'm2m', 'rel', 'view', 'cmdb_rel'];
const VALID_FORMATS  = ['json', 'markdown', 'jsonld', 'owl', 'openapi'];

const config = {
    instance:   args.instance   || process.env.SN_INSTANCE,
    user:       args.user       || process.env.SN_USER,
    password:   args.password   || process.env.SN_PASSWORD,
    apikey:     args.apikey     || process.env.SN_APIKEY,
    output:     args.output     || process.env.SN_OUTPUT    || null,  // default depends on format
    // Keep pages small so each HTTP response stays well under ServiceNow's
    // server-side response-size limit (~5 MB). At ~600 bytes/row for
    // sys_dictionary, 1000 rows ≈ 600 KB — safe on any instance.
    pageSize:   parseInt(args['page-size'] || process.env.SN_PAGE_SIZE || '1000', 10),
    format:     (args.format    || process.env.SN_FORMAT    || 'json').toLowerCase(),
    edgeTypes:  (args['edge-types'] || process.env.SN_EDGE_TYPES || ALL_EDGE_TYPES.join(',')).split(',').map(s => s.trim()).filter(Boolean),
    includeRecordCounts: !!args['include-record-counts'],
    pretty:     !!args.pretty,
    verbose:    !!args.verbose
};

function die(msg, code) {
    console.error('ERROR: ' + msg);
    process.exit(code || 1);
}

if (!config.instance) {
    die('Required: --instance (or SN_INSTANCE env var)');
}
if (!config.apikey && (!config.user || !config.password)) {
    die('Required: --apikey (API key auth) or --user + --password (Basic auth)\n' +
        '  Env-var equivalents: SN_APIKEY  or  SN_USER + SN_PASSWORD');
}
if (!VALID_FORMATS.includes(config.format)) {
    die('Unknown --format "' + config.format + '". Valid options: ' + VALID_FORMATS.join(', '));
}
// Default output path depends on format
if (!config.output) {
    const exts = { json: '.json', markdown: '.md', jsonld: '.jsonld', owl: '.ttl', openapi: '.yaml' };
    config.output = 'sn_schema_export' + (exts[config.format] || '.json');
}
if (!/^https?:\/\//.test(config.instance)) config.instance = 'https://' + config.instance;
config.instance = config.instance.replace(/\/+$/, '');

// ─── Progress bar (TTY only, no external deps) ────────────────────────────
const Progress = (() => {
    const isTTY = !!process.stdout.isTTY;
    const st    = new Map(); // tableName → { n: rows fetched, total: total rows | null }
    let   t0    = 0;
    let   _len  = 0;         // character length of the last drawn line (for erasure)

    function clearLine() {
        if (!isTTY || !_len) return;
        process.stdout.write('\r' + ' '.repeat(_len) + '\r');
        _len = 0;
    }

    // Locale-independent thousands separator (avoids "6.660" on European locales)
    function fmtN(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

    function draw() {
        if (!isTTY) return;
        let sumN = 0, sumTotal = 0, hasTot = false;
        let bigName = '', bigN = 0, bigTotal = null, bigInProg = false;
        for (const [name, s] of st) {
            sumN += s.n;
            if (s.total != null) { sumTotal += s.total; hasTot = true; }
            // Prefer tables still in progress over completed ones so the label
            // shows the active fetch rather than the largest completed table.
            const inProg = s.total == null || s.n < s.total;
            if (inProg && !bigInProg) {
                bigName = name; bigN = s.n; bigTotal = s.total; bigInProg = true;
            } else if (inProg === bigInProg && s.n >= bigN) {
                bigName = name; bigN = s.n; bigTotal = s.total;
            }
        }
        const elapsedS = (Date.now() - t0) / 1000;
        const pct  = hasTot && sumTotal > 0 ? Math.round(100 * sumN / sumTotal) : null;
        const rate = elapsedS > 3 ? sumN / elapsedS : 0;
        const eta  = pct != null && rate > 0 && sumN < sumTotal
            ? '~' + Math.round((sumTotal - sumN) / rate) + 's' : '';

        // Stage counter: N/total tables complete
        const totalTables = st.size;
        const doneTables  = totalTables > 0
            ? [...st.values()].filter(s => s.total != null && s.n >= s.total).length
            : 0;
        const stageS = totalTables > 0 ? doneTables + '/' + totalTables + '  ' : '';

        const W    = 25;
        const fill = pct != null ? Math.round(W * Math.min(pct, 100) / 100) : 0;
        const bar  = '█'.repeat(fill) + '░'.repeat(W - fill);
        const pctS = pct != null ? (pct + '%').padStart(4) : '   …';
        const tblS = bigName
            ? '  ' + bigName + ' ' + fmtN(bigN) +
              (bigTotal != null ? '/' + fmtN(bigTotal) : '')
            : '';
        const etaS = eta ? '  ' + eta : '';

        const line = '  ' + stageS + '[' + bar + '] ' + pctS + tblS + etaS;
        const cols = Math.max(40, (process.stdout.columns || 120) - 1);
        const out  = line.length > cols ? line.slice(0, cols) : line;
        process.stdout.write('\r' + out);
        _len = out.length;
    }

    return {
        start:    () => { t0 = Date.now(); st.clear(); },
        // Pre-register a table so it is counted in the N/total denominator from the start.
        // Must be called AFTER start() (which clears the map).
        register: (name) => { if (!st.has(name)) st.set(name, { n: 0, total: null }); },
        update:   (name, n, total) => { st.set(name, { n, total: total ?? null }); draw(); },
        clearLine: clearLine,
        clear:    () => { clearLine(); st.clear(); },
    };
})();

const log  = (...a) => { Progress.clearLine(); console.log('[' + new Date().toISOString() + ']', ...a); };
const vlog = (...a) => { if (config.verbose) log(...a); };

// ─── HTTP helper (basic auth, JSON responses) ─────────────────────────────
function httpGet(urlString) {
    return new Promise((resolve, reject) => {
        const u = new URL(urlString);
        const opts = {
            hostname: u.hostname,
            port:     u.port || (u.protocol === 'https:' ? 443 : 80),
            path:     u.pathname + u.search,
            method:   'GET',
            headers: {
                ...(config.apikey
                    ? { 'x-sn-apikey': config.apikey }
                    : { 'Authorization': 'Basic ' + Buffer.from(config.user + ':' + config.password).toString('base64') }
                ),
                'Accept':     'application/json',
                'User-Agent': 'sn-schema-exporter/2.0'
            }
        };
        const lib = u.protocol === 'https:' ? https : http;
        const req = lib.request(opts, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const body = Buffer.concat(chunks);
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(new Error('HTTP ' + res.statusCode + ' on ' + urlString + ': ' + body.toString('utf8').slice(0, 500)));
                }
                resolve({ body, headers: res.headers });
            });
        });
        req.on('error', reject);
        // Generous timeout — large pages can take a while
        req.setTimeout(300000, () => req.destroy(new Error('Request timeout: ' + urlString)));
        req.end();
    });
}

async function fetchJson(urlString) {
    const { body } = await httpGet(urlString);
    try { return JSON.parse(body.toString('utf8')); }
    catch (e) { throw new Error('Invalid JSON from ' + urlString + ': ' + e.message); }
}

// ─── Instance metadata (Table API + Stats API) ────────────────────────────
async function fetchInstanceInfo() {
    const info = {
        instance_name: (() => { try { return new URL(config.instance).hostname.split('.')[0]; } catch (e) { return ''; } })(),
        instance_url:  config.instance,
        exported_at:   new Date().toISOString(),
        exported_by:   config.user || null,
        export_mode:   'table-api'
    };

    // Build properties — use the *.last variants which reflect the current build
    // accurately on patched instances. build_name comes from the embedded-help version
    // property (always lowercase, e.g. "vancouver patch 3") — capitalise the first letter.
    try {
        const data = await fetchJson(
            config.instance + '/api/now/table/sys_properties' +
            '?sysparm_fields=name,value' +
            '&sysparm_query=nameINcom.glide.embedded_help.version,glide.buildtag.last,glide.builddate.last' +
            '&sysparm_limit=10'
        );
        for (const row of (data.result || [])) {
            const val = (row.value && typeof row.value === 'object') ? (row.value.value || null) : (row.value || null);
            const key = (row.name && typeof row.name === 'object') ? row.name.value : row.name;
            if (key === 'com.glide.embedded_help.version')
                info.build_name = val ? val.charAt(0).toUpperCase() + val.slice(1) : val;
            if (key === 'glide.buildtag.last')  info.build_tag  = val;
            if (key === 'glide.builddate.last') info.build_date = val;
        }
    } catch (e) { vlog('Could not fetch build properties:', e.message); }

    // Aggregate counts — run all four in parallel via Stats API
    async function statsCount(table, query) {
        try {
            const url = config.instance + '/api/now/stats/' + table +
                '?sysparm_count=true' +
                (query ? '&sysparm_query=' + encodeURIComponent(query) : '');
            const data = await fetchJson(url);
            const c = data.result && data.result.stats && data.result.stats.count;
            return c != null ? (parseInt(c, 10) || 0) : null;
        } catch (e) { return null; }
    }
    const [nodeCount, activePlugins, activePackages, activeLanguages] = await Promise.all([
        statsCount('sys_cluster_state', null),
        statsCount('v_plugin',     'active=active'),
        statsCount('sys_package',  'active=true'),
        statsCount('sys_language', 'active=true')
    ]);
    info.node_count       = nodeCount;
    info.active_plugins   = activePlugins;
    info.active_packages  = activePackages;
    info.active_languages = activeLanguages;
    return info;
}

// ─── Table API mode ───────────────────────────────────────────────────────
async function fetchTableAll(table, queryString, fields, _onProgress) {
    // Use sysparm_query for filters, sysparm_fields to whitelist what we need.
    const all = [];
    let offset = 0;
    let knownTotal = null; // populated from X-Total-Count response header on the first page
    const params = new URLSearchParams();
    params.set('sysparm_limit',          String(config.pageSize));
    params.set('sysparm_display_value',  'all'); // returns {display_value, value} for refs
    params.set('sysparm_exclude_reference_link', 'true');
    // Stable sort by sys_id ensures page boundaries are consistent across all
    // requests. Without this, ServiceNow may return rows in a different order on
    // each page fetch (index scans, shard differences, background writes), causing
    // boundary rows to appear on two consecutive pages and producing duplicates.
    params.set('sysparm_orderby',        'sys_id');
    if (fields)       params.set('sysparm_fields', fields.join(','));
    if (queryString)  params.set('sysparm_query',  queryString);
    // Stop only when the API returns an empty page. Do NOT break on
    // rows.length < pageSize: some instances cap the effective page size
    // below our requested limit, which would cause early termination after
    // the very first page and silently drop the remaining rows.
    while (true) {
        params.set('sysparm_offset', String(offset));
        const url = config.instance + '/api/now/table/' + table + '?' + params.toString();
        vlog('GET', url);
        const { body, headers } = await httpGet(url);
        let data;
        try { data = JSON.parse(body.toString('utf8')); }
        catch (e) { throw new Error('Invalid JSON from ' + url + ': ' + e.message); }
        const rows = data.result || [];
        if (rows.length === 0) break;
        // X-Total-Count is returned by the Table API and gives the full record count
        // for the query — read it once on the first page to enable % progress display.
        if (offset === 0 && headers['x-total-count']) {
            const tc = parseInt(headers['x-total-count'], 10);
            if (tc > 0) knownTotal = tc;
        }
        all.push(...rows);
        offset += rows.length;
        if (_onProgress) _onProgress(all.length, knownTotal);
    }
    return all;
}

/**
 * Normalise a Table API row (with sysparm_display_value=all) into the shape
 * the SchemaBuilder expects: reference fields become { value, displayValue, name? }
 * where `name` is what we need for joins.
 *
 * Quirk: with sysparm_display_value=all, the API returns ref fields as
 *   { display_value: "User Label", value: "sys_id_text" }
 * It does NOT include the linked record's `name` column. We can't generally
 * fetch it without a second query. For our purposes:
 *   - super_class: we need the parent table's .name. Workaround: fetch
 *     sys_db_object FIRST, then build a sys_id -> name map, then resolve
 *     super_class references on the second pass.
 *   - reference (sys_dictionary): the column is of type table_name, so its
 *     value IS already the table name — no map lookup needed.
 *   - view (sys_db_view_table): uses a sys_id -> name map built from sys_db_view.
 */
function refFromTableApi(val) {
    if (val == null) return null;
    if (typeof val === 'object') {
        return { displayValue: val.display_value || '', value: val.value || '', name: '' };
    }
    return { displayValue: String(val), value: String(val), name: '' };
}

async function fetchAllViaTableApi() {
    log('Fetching via Table API (parallel)…');
    Progress.start();
    // Pre-register all tables so the N/total stage counter is correct from the first page.
    ['sys_db_object','sys_db_view','sys_glide_object',
     'sys_dictionary','sys_m2m','sys_db_view_table','sys_relationship',
     'cmdb_rel_type_suggest','cmdb_rel_type'].forEach(t => Progress.register(t));
    const prog = name => (n, t) => Progress.update(name, n, t);

    // First wave: data we need to build sys_id → name lookups
    const [sysDbObjectRaw, sysDbViewRaw, sysGlideObjectRaw] = await Promise.all([
        fetchTableAll('sys_db_object',    null,
            ['sys_id','name','label','super_class','sys_scope','is_extendable','access','ws_access','scriptable_table'],
            prog('sys_db_object')),
        fetchTableAll('sys_db_view',      null,
            ['sys_id','name','label','description','plural'],
            prog('sys_db_view')),
        fetchTableAll('sys_glide_object', null,
            ['sys_id','name','label','scalar_type','scalar_length','class_name','visible','attributes'],
            prog('sys_glide_object'))
    ]);
    log('  sys_db_object: ' + sysDbObjectRaw.length);
    log('  sys_db_view:   ' + sysDbViewRaw.length);
    log('  sys_glide_object: ' + sysGlideObjectRaw.length);

    // Build sys_id → table-name map (used to resolve super_class, reference, view refs)
    // Helper to unwrap simple display_value/value cells from sysparm_display_value=all.
    // MUST be defined before the sys_id→name maps below — with sysparm_display_value=all
    // every field (including sys_id) comes back as { value, display_value }, so using
    // t.sys_id directly as a map key coerces to '[object Object]' and collapses all
    // entries onto the same slot.
    const cell = (row, field) => {
        const v = row[field];
        if (v == null) return '';
        if (typeof v === 'object') return v.value || '';
        return String(v);
    };
    const cellBool = (row, field) => cell(row, field) === 'true';
    const refField = (row, field, sysIdToName) => {
        const v = row[field];
        if (v == null) return null;
        const sid = (typeof v === 'object') ? (v.value || '') : String(v);
        const dv  = (typeof v === 'object') ? (v.display_value || '') : '';
        if (!sid && !dv) return null;
        return { value: sid, displayValue: dv, name: (sysIdToName && sysIdToName[sid]) || '' };
    };

    // Build sys_id → table-name map (used to resolve super_class, reference, view refs)
    const tableSysIdToName = {};
    for (const t of sysDbObjectRaw) tableSysIdToName[cell(t, 'sys_id')] = cell(t, 'name');
    const viewSysIdToName = {};
    for (const v of sysDbViewRaw)   viewSysIdToName[cell(v, 'sys_id')]  = cell(v, 'name');

    // Second wave: dictionary, m2m, db_view_table, relationship, cmdb topology, and instance info (all in parallel)
    const [sysDictionaryRaw, sysM2mRaw, sysDbViewTableRaw, sysRelationshipRaw,
           cmdbRelTypeSuggestRaw, cmdbRelTypeRaw, instanceInfo] = await Promise.all([
        // active!=false is the correct Table API equivalent of GlideRecord's
        // addQuery('active', true): it matches active=1 (explicit true) AND
        // active=NULL (unset, the default for most rows), mirroring GlideRecord's
        // "truthy null" behaviour.  Do NOT use active=true — that only matches
        // rows where the boolean is explicitly stored as 1, silently cutting ~93%
        // of field definitions (the majority of sys_dictionary rows never have
        // active written at all and therefore have active=NULL).
        fetchTableAll('sys_dictionary', 'elementISNOTEMPTY^active!=false',
            ['name','element','column_label','internal_type','reference','max_length','mandatory','primary','virtual','active'],
            prog('sys_dictionary')),
        fetchTableAll('sys_m2m', null,
            ['from_table','to_table','m2m_table','m2m_from_field','m2m_to_field','m2m_from_label','m2m_to_label'],
            prog('sys_m2m')),
        fetchTableAll('sys_db_view_table', null,
            ['view','table','order','left_join','where_clause','variable_prefix','active'],
            prog('sys_db_view_table')),
        fetchTableAll('sys_relationship', null,
            ['name','query_from','query_with','apply_to','basic_query_from','basic_apply_to','advanced'],
            prog('sys_relationship')),
        // cmdb_rel_type_suggest may not exist on older / non-CMDB instances; catch and fall back to []
        fetchTableAll('cmdb_rel_type_suggest', null,
            ['base_class','dependent_class','parent','cmdb_rel_type'],
            prog('cmdb_rel_type_suggest')).catch(() => {
                Progress.update('cmdb_rel_type_suggest', 0, 0); return [];
            }),
        // cmdb_rel_type: small table (~50–100 rows) — fetch to build sys_id → display map.
        // We resolve display names here rather than relying on dot-walking or display_value
        // of the reference field in cmdb_rel_type_suggest, both of which are unreliable.
        fetchTableAll('cmdb_rel_type', null,
            ['sys_id','parent_descriptor','child_descriptor'],
            prog('cmdb_rel_type')).catch(() => {
                Progress.update('cmdb_rel_type', 0, 0); return [];
            }),
        fetchInstanceInfo()
    ]);
    Progress.clear();
    log('  sys_dictionary: ' + sysDictionaryRaw.length);
    log('  sys_m2m: ' + sysM2mRaw.length);
    log('  sys_db_view_table: ' + sysDbViewTableRaw.length);
    log('  sys_relationship: ' + sysRelationshipRaw.length);
    log('  cmdb_rel_type_suggest: ' + cmdbRelTypeSuggestRaw.length);
    log('  cmdb_rel_type: ' + cmdbRelTypeRaw.length);

    // Now normalise into the builder's input shape
    const sysDbObject = sysDbObjectRaw.map(r => ({
        sys_id:        cell(r, 'sys_id'),
        name:          cell(r, 'name'),
        label:         cell(r, 'label'),
        super_class:   refField(r, 'super_class', tableSysIdToName),
        sys_scope:     refField(r, 'sys_scope', null),
        is_extendable: cellBool(r, 'is_extendable'),
        access:        cell(r, 'access'),
        // ws_access: true = table reachable via Table API / REST; false = blocked.
        // Defaults to true when the field is absent or empty (older instances).
        ws_access:     cell(r, 'ws_access') !== 'false',
        scriptable_table: cellBool(r, 'scriptable_table')
    }));
    const sysDictionary = sysDictionaryRaw.map(r => ({
        name:          cell(r, 'name'),
        element:       cell(r, 'element'),
        column_label:  cell(r, 'column_label'),
        internal_type: (function () {
            const v = r.internal_type;
            if (!v) return { value: 'string', displayValue: 'String' };
            if (typeof v === 'object') return { value: v.value || 'string', displayValue: v.display_value || v.value || 'string' };
            return { value: String(v), displayValue: String(v) };
        })(),
        // sys_dictionary.reference stores the table NAME directly (type=table_name),
        // not a sys_id — so value IS the name; no map lookup needed.
        reference:     (function () {
            const v = r.reference;
            if (!v) return null;
            const val = (typeof v === 'object') ? (v.value || '') : String(v || '');
            const dv  = (typeof v === 'object') ? (v.display_value || '') : '';
            if (!val && !dv) return null;
            return { value: val, displayValue: dv, name: val };
        })(),
        max_length:    cell(r, 'max_length'),
        mandatory:     cellBool(r, 'mandatory'),
        primary:       cellBool(r, 'primary'),
        virtual:       cellBool(r, 'virtual'),
        active:        cellBool(r, 'active')
    }));
    const sysM2m = sysM2mRaw.map(r => ({
        from_table:      cell(r, 'from_table'),
        to_table:        cell(r, 'to_table'),
        m2m_table:       cell(r, 'm2m_table'),
        m2m_from_field:  cell(r, 'm2m_from_field'),
        m2m_to_field:    cell(r, 'm2m_to_field'),
        m2m_from_label:  cell(r, 'm2m_from_label'),
        m2m_to_label:    cell(r, 'm2m_to_label')
    }));
    const sysDbView = sysDbViewRaw.map(r => ({
        name: cell(r, 'name'), label: cell(r, 'label'),
        description: cell(r, 'description'), plural: cell(r, 'plural')
    }));
    const sysDbViewTable = sysDbViewTableRaw.map(r => ({
        view: refField(r, 'view', viewSysIdToName),
        table: cell(r, 'table'),
        order: cell(r, 'order'),
        left_join: cellBool(r, 'left_join'),
        where_clause: cell(r, 'where_clause'),
        variable_prefix: cell(r, 'variable_prefix'),
        active: cellBool(r, 'active')
    }));
    const sysRelationship = sysRelationshipRaw.map(r => ({
        name: cell(r, 'name'),
        query_from: cell(r, 'query_from'),
        query_with: cell(r, 'query_with'),
        apply_to:   cell(r, 'apply_to'),
        basic_query_from: cell(r, 'basic_query_from'),
        basic_apply_to:   cell(r, 'basic_apply_to'),
        advanced:   cellBool(r, 'advanced')
    }));
    const sysGlideObject = sysGlideObjectRaw.map(r => ({
        name: cell(r, 'name'), label: cell(r, 'label'),
        scalar_type:   cell(r, 'scalar_type'),
        scalar_length: cell(r, 'scalar_length'),
        class_name:    cell(r, 'class_name'),
        visible:       cellBool(r, 'visible'),
        attributes:    cell(r, 'attributes')
    }));
    // Build sys_id → "parent_descriptor::child_descriptor" map from the cmdb_rel_type table.
    // This is more reliable than dot-walking or display_value on the reference field in
    // cmdb_rel_type_suggest: sysparm_display_value=all returns empty display_value for ~half
    // the rows, and dot-walked descriptor fields come back with an empty value (only
    // display_value is populated for these label-type fields), which cell() would miss.
    const relTypeById = new Map();
    for (const rt of cmdbRelTypeRaw) {
        const id = cell(rt, 'sys_id');
        const pd = cell(rt, 'parent_descriptor') || (rt.parent_descriptor && typeof rt.parent_descriptor === 'object' ? rt.parent_descriptor.display_value || '' : '');
        const cd = cell(rt, 'child_descriptor')  || (rt.child_descriptor  && typeof rt.child_descriptor  === 'object' ? rt.child_descriptor.display_value  || '' : '');
        if (id && pd) relTypeById.set(id, pd + (cd ? '::' + cd : ''));
    }
    log('  cmdb_rel_type (map entries): ' + relTypeById.size);

    // cmdb_rel_type_suggest — class-to-class topology metadata.
    let cmdbRelTypeSuggestNoMatch = 0;
    const cmdbRelTypeSuggest = cmdbRelTypeSuggestRaw.map(r => {
        const rt    = r.cmdb_rel_type;
        const sysId = (rt && typeof rt === 'object') ? (rt.value || '') : String(rt || '');
        const mapped = relTypeById.get(sysId);
        if (!mapped) cmdbRelTypeSuggestNoMatch++;
        const disp  = mapped ||
                      ((rt && typeof rt === 'object') ? (rt.display_value || '') : '');
        return {
            base_class:       cell(r, 'base_class'),
            dependent_class:  cell(r, 'dependent_class'),
            parent:           cellBool(r, 'parent'),
            rel_type_display: disp
        };
    }).filter(r => r.base_class && r.dependent_class && r.rel_type_display);
    log('  cmdb_rel_type_suggest (after filter): ' + cmdbRelTypeSuggest.length +
        (cmdbRelTypeSuggestNoMatch ? '  (' + cmdbRelTypeSuggestNoMatch + ' rows had no map match — used display_value fallback)' : ''));

    // Per-table record counts via Stats API — opt-in. Failure classification
    // mirrors the BG script: ACL denials, unsupported
    // aggregates, and underlying-script errors are recorded with category
    // metadata so the viewer can render "unavailable (acl)" etc. rather than
    // misleadingly showing 0.
    let recordCounts = null;
    let recordCountFailures = null;
    if (config.includeRecordCounts) {
        log('Collecting record counts (this is the slow step)…');
        recordCounts = {};
        recordCountFailures = {};
        const classify = (errMsgRaw, status) => {
            const msg = String(errMsgRaw || '').toLowerCase();
            if (status === 401 || status === 403) return 'acl';
            if (msg.includes('security restricted') || msg.includes('access denied') ||
                msg.includes('source descriptor is empty') || msg.includes('restricted caller access')) return 'acl';
            if (msg.includes('does not support aggregate')) return 'unsupported';
            if (msg.includes('rhinoecma') || msg.includes('undefined value has no properties') ||
                msg.includes('typeerror') || msg.includes('referenceerror')) return 'script_error';
            return 'other';
        };
        const names = sysDbObject.map(t => t.name).filter(Boolean);
        let done = 0;
        // Cheap parallelism with a worker pool to keep the instance happy
        const CONCURRENCY = 8;
        async function worker() {
            while (true) {
                const idx = done++;
                if (idx >= names.length) return;
                const name = names[idx];
                if (/^sys_|^var_|^ts_/.test(name)) continue;
                try {
                    const url = config.instance + '/api/now/stats/' + name + '?sysparm_count=true';
                    const data = await fetchJson(url);
                    const c = data.result && data.result.stats && data.result.stats.count;
                    if (c != null) {
                        recordCounts[name] = parseInt(c, 10) || 0;
                    } else {
                        recordCounts[name] = null;
                        recordCountFailures[name] = { category: 'other', message: 'no count in response' };
                    }
                } catch (e) {
                    recordCounts[name] = null;
                    recordCountFailures[name] = {
                        category: classify(e && e.message, e && e.status),
                        message:  String((e && e.message) || e || 'unknown').substring(0, 200)
                    };
                }
            }
        }
        await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
        const succeeded = Object.values(recordCounts).filter(v => v !== null).length;
        const failed    = Object.values(recordCounts).filter(v => v === null).length;
        log(`  record counts collected: ${succeeded} tables (${failed} could not be counted)`);
    }

    return {
        sysDbObject, sysDictionary, sysM2m,
        sysDbView, sysDbViewTable, sysRelationship,
        sysGlideObject, cmdbRelTypeSuggest, recordCounts, recordCountFailures,
        instance: instanceInfo
    };
}

// ─── Format serialisers (non-JSON output) ────────────────────────────────────

/**
 * Build an adjacency map from the raw schema object.
 * The viewer normally builds this at load time; we replicate it here so the
 * serialiser functions can navigate the graph without iterating all edges repeatedly.
 */
function buildAdj(schema) {
    const adj = new Map();
    const ensure = id => { if (!adj.has(id)) adj.set(id, { out: [], in: [] }); };
    const allEdges = [
        ...(schema.edges || []),
        ...(schema._ciRelationships || []).map(r => ({
            type:   'cmdb_rel',
            source: r.source || r.baseClass       || '',
            target: r.target || r.dependentClass  || '',
            label:  r.label  || r.relTypeDisplay  || '',
        })),
    ];
    for (const e of allEdges) {
        const s = (e.source && e.source.id) ? e.source.id : e.source;
        const t = (e.target && e.target.id) ? e.target.id : e.target;
        if (!s || !t) continue;
        ensure(s); ensure(t);
        adj.get(s).out.push(e);
        adj.get(t).in.push(e);
    }
    return adj;
}

/** Human-readable label for a SN field type (mirrors viewer's typeLabel()). */
function snTypeLabel(type) {
    const MAP = {
        string: 'String', string_full_utf8: 'String (Full UTF-8)', html: 'HTML',
        url: 'URL', translated_text: 'Translated Text', phone_number: 'Phone Number',
        char: 'Single Line Text', GUID: 'Sys ID (GUID)', password: 'Password',
        integer: 'Integer', smallint: 'Small Integer', longint: 'Long Integer',
        float: 'Floating Point', decimal: 'Decimal', currency: 'Currency',
        boolean: 'True/False', percent_complete: 'Percent Complete',
        glide_date_time: 'Date/Time', due_date: 'Due Date',
        glide_date: 'Date', glide_time: 'Time', timer: 'Timer',
        reference: 'Reference', glide_list: 'List', document_id: 'Document ID',
        journal: 'Journal', journal_input: 'Journal Input', journal_list: 'Journal List',
        composite_field: 'Composite Field', conditions: 'Conditions',
        script: 'Script', script_plain: 'Script (Plain)', script_server: 'Script (Server)',
        user_image: 'User Image', image: 'Image', audio: 'Audio',
        color: 'Color', color_display: 'Color Display',
        email: 'Email', ip_addr: 'IP Address', price: 'Price',
        order_index: 'Order Index', sequence: 'Sequence', counter: 'Counter',
        table_name: 'Table Name', field_name: 'Field Name', value: 'Value',
        xml: 'XML', json: 'JSON', slushbucket: 'Slushbucket',
        domain_id: 'Domain', wiki: 'Wiki',
    };
    return MAP[type] || type || '';
}

// XSD type mapping
const NODE_TYPE_XSD = {
    string: 'xsd:string', string_full_utf8: 'xsd:string', html: 'xsd:string',
    url: 'xsd:anyURI', translated_text: 'xsd:string', phone_number: 'xsd:string',
    char: 'xsd:string', GUID: 'xsd:string', password: 'xsd:string',
    integer: 'xsd:integer', smallint: 'xsd:integer', longint: 'xsd:integer',
    float: 'xsd:decimal', decimal: 'xsd:decimal', currency: 'xsd:decimal',
    boolean: 'xsd:boolean',
    glide_date_time: 'xsd:dateTime', due_date: 'xsd:dateTime',
    glide_date: 'xsd:date', glide_time: 'xsd:time',
};
const snTypeToXsd = t => NODE_TYPE_XSD[t] || 'xsd:string';

// OpenAPI type mapping
const NODE_TYPE_OA     = { string: 'string', string_full_utf8: 'string', html: 'string', url: 'string', translated_text: 'string', phone_number: 'string', char: 'string', GUID: 'string', password: 'string', integer: 'integer', smallint: 'integer', longint: 'integer', float: 'number', decimal: 'number', currency: 'number', boolean: 'boolean', glide_date_time: 'string', due_date: 'string', glide_date: 'string', glide_time: 'string' };
const NODE_TYPE_OA_FMT = { url: 'uri', float: 'float', decimal: 'double', currency: 'double', longint: 'int64', smallint: 'int32', glide_date_time: 'date-time', due_date: 'date-time', glide_date: 'date', glide_time: 'time' };

function serializeMarkdown(schema, opts) {
    const etSet = new Set(opts.edgeTypes || ALL_EDGE_TYPES);
    const inst = schema._instance && (schema._instance.instance_name || schema._instance.instance_url) || '';
    const date = new Date().toISOString().slice(0, 10);
    const lines = [
        '# ServiceNow Schema Export',
        '',
        '> Generated by [SN Schema Explorer](https://github.com/revampd/sn-schema-explorer) on ' + date +
            (inst ? ' — instance: ' + inst : ''),
        '',
        '**Scope:** full schema',
        '',
        '---',
        '',
    ];
    const nodes = (schema.nodes || []).filter(n => !n._diffOnly).sort((a, b) => a.id < b.id ? -1 : 1);
    for (const node of nodes) {
        const adj = schema._adj.get(node.id);
        const out = (adj && adj.out) || [];
        const inn = (adj && adj.in)  || [];
        const parentEdge = etSet.has('extends') ? out.find(e => e.type === 'extends') : null;
        const parentId   = parentEdge ? ((parentEdge.target && parentEdge.target.id) || parentEdge.target) : null;
        let heading = '## ' + node.id;
        if (node.label && node.label !== node.id) heading += ' — ' + node.label;
        if (parentId) heading += ' *(extends: ' + parentId + ')*';
        lines.push(heading, '');
        if (node.fields && node.fields.length) {
            lines.push('| Field | Type | Label |');
            lines.push('|---|---|---|');
            for (const f of node.fields) {
                const tl  = snTypeLabel(f.type) || f.type || '';
                const lbl = (f.label && f.label !== f.name) ? f.label : '';
                lines.push('| `' + f.name + '` | ' + tl + ' | ' + lbl + ' |');
            }
            lines.push('');
        }
        if (etSet.has('reference')) {
            const refs = out.filter(e => e.type === 'reference').map(e => {
                const tgt = (e.target && e.target.id) || e.target;
                return e.field ? '`' + e.field + '` → ' + tgt : '→ ' + tgt;
            });
            if (refs.length) lines.push('**References:** ' + refs.join(', '), '');
            const refsIn = inn.filter(e => e.type === 'reference').map(e => {
                const src = (e.source && e.source.id) || e.source;
                return e.field ? src + '.`' + e.field + '`' : src;
            }).sort();
            if (refsIn.length) lines.push('**Referenced by:** ' + refsIn.join(', '), '');
        }
        if (etSet.has('extends')) {
            const extBy = inn.filter(e => e.type === 'extends').map(e => (e.source && e.source.id) || e.source).sort();
            if (extBy.length) lines.push('**Extended by:** ' + extBy.join(', '), '');
        }
        if (etSet.has('m2m')) {
            const seen = new Set(); const m2ms = [];
            for (const e of out.concat(inn)) {
                if (e.type !== 'm2m') continue;
                const other = ((e.source && e.source.id) || e.source) === node.id ? ((e.target && e.target.id) || e.target) : ((e.source && e.source.id) || e.source);
                const key = other + '\0' + (e.m2mTable || '');
                if (seen.has(key)) continue; seen.add(key);
                m2ms.push(e.m2mTable ? other + ' (via `' + e.m2mTable + '`)' : other);
            }
            m2ms.sort();
            if (m2ms.length) lines.push('**M2M relationships:** ' + m2ms.join(', '), '');
        }
        if (etSet.has('cmdb_rel')) {
            const seen = new Set(); const ciRels = [];
            for (const e of out.concat(inn)) {
                if (e.type !== 'cmdb_rel') continue;
                const other = ((e.source && e.source.id) || e.source) === node.id ? ((e.target && e.target.id) || e.target) : ((e.source && e.source.id) || e.source);
                const key = other + '\0' + (e.label || '');
                if (seen.has(key)) continue; seen.add(key);
                ciRels.push(e.label ? e.label + ' → ' + other : other);
            }
            ciRels.sort();
            if (ciRels.length) lines.push('**CI topology:** ' + ciRels.join(', '), '');
        }
        if (etSet.has('view') && node._isView) {
            const v = out.filter(e => e.type === 'view').map(e => (e.target && e.target.id) || e.target).sort();
            if (v.length) lines.push('**View includes tables:** ' + v.join(', '), '');
        } else if (etSet.has('view') && !node._isView) {
            const v = inn.filter(e => e.type === 'view').map(e => (e.source && e.source.id) || e.source).sort();
            if (v.length) lines.push('**Member of views:** ' + v.join(', '), '');
        }
        lines.push('\n---\n');
    }
    return lines.join('\n');
}

function serializeJsonLd(schema, opts) {
    const etSet = new Set(opts.edgeTypes || ALL_EDGE_TYPES);
    const inst = schema._instance && (schema._instance.instance_name || schema._instance.instance_url) || '';
    const context = {
        owl: 'http://www.w3.org/2002/07/owl#', rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
        xsd: 'http://www.w3.org/2001/XMLSchema#', rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        sn: 'https://servicenow.com/schema#', snp: 'https://servicenow.com/table/',
    };
    const meta = {
        '@id': 'https://servicenow.com/schema', '@type': 'owl:Ontology',
        'rdfs:label': 'ServiceNow Schema' + (inst ? ' — ' + inst : ''),
        'sn:exportedAt': new Date().toISOString(),
    };
    const nodes = (schema.nodes || []).filter(n => !n._diffOnly).sort((a, b) => a.id < b.id ? -1 : 1);
    const graph = [meta];
    for (const node of nodes) {
        const adj = schema._adj.get(node.id);
        const out = (adj && adj.out) || [];
        const inn = (adj && adj.in)  || [];
        const cls = {
            '@id': 'snp:' + node.id, '@type': node._isView ? ['owl:Class', 'sn:DbView'] : 'owl:Class',
            'rdfs:label': node.label || node.id, 'sn:technicalName': node.id, 'sn:scope': node.scope || 'Global',
        };
        if (node.ws_access === false) cls['sn:wsAccessible'] = false;
        if (etSet.has('extends')) {
            const pe = out.find(e => e.type === 'extends');
            if (pe) cls['rdfs:subClassOf'] = { '@id': 'snp:' + ((pe.target && pe.target.id) || pe.target) };
            const ch = inn.filter(e => e.type === 'extends').map(e => ({ '@id': 'snp:' + ((e.source && e.source.id) || e.source) }));
            if (ch.length) cls['sn:extendedBy'] = ch.length === 1 ? ch[0] : ch;
        }
        if (node.fields && node.fields.length) {
            cls['sn:fields'] = node.fields.map(f => {
                const isRef = f.type === 'reference';
                const fd = { '@type': isRef ? 'owl:ObjectProperty' : 'owl:DatatypeProperty', 'rdfs:label': f.label || f.name, 'sn:technicalName': f.name, 'sn:dataType': f.type || 'string' };
                if (isRef && etSet.has('reference')) {
                    const re = out.find(e => e.type === 'reference' && e.field === f.name);
                    if (re) fd['rdfs:range'] = { '@id': 'snp:' + ((re.target && re.target.id) || re.target) };
                } else if (!isRef) { fd['rdfs:range'] = { '@id': snTypeToXsd(f.type) }; }
                if (f.mandatory) fd['sn:mandatory'] = true;
                if (f.primary)   fd['sn:primary']   = true;
                return fd;
            });
        }
        if (etSet.has('m2m')) {
            const seen = new Set(); const m2ms = [];
            for (const e of out.concat(inn)) {
                if (e.type !== 'm2m') continue;
                const other = ((e.source && e.source.id) || e.source) === node.id ? ((e.target && e.target.id) || e.target) : ((e.source && e.source.id) || e.source);
                if (seen.has(other)) continue; seen.add(other);
                const r = { 'sn:relatedTable': { '@id': 'snp:' + other } };
                if (e.m2mTable) r['sn:junctionTable'] = e.m2mTable;
                m2ms.push(r);
            }
            if (m2ms.length) cls['sn:m2mRelationships'] = m2ms.length === 1 ? m2ms[0] : m2ms;
        }
        graph.push(cls);
    }
    return JSON.stringify({ '@context': context, '@graph': graph }, null, opts.pretty ? 2 : 0);
}

function serializeTurtle(schema, opts) {
    const etSet = new Set(opts.edgeTypes || ALL_EDGE_TYPES);
    const inst = schema._instance && (schema._instance.instance_name || schema._instance.instance_url) || '';
    const date = new Date().toISOString();
    const ttlLit = s => '"' + String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
    const ttlId  = s => String(s).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^([^a-zA-Z_])/, '_$1');
    const block  = (subj, pairs) => {
        if (!pairs.length) return subj + ' .\n\n';
        return subj + '\n' + pairs.map((p, i) => '  ' + p[0] + ' ' + p[1] + (i < pairs.length - 1 ? ' ;' : ' .')).join('\n') + '\n\n';
    };
    const parts = [
        '@prefix owl:  <http://www.w3.org/2002/07/owl#> .',
        '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
        '@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .',
        '@prefix sn:   <https://servicenow.com/schema#> .',
        '@prefix snp:  <https://servicenow.com/table/> .',
        '',
        '# ServiceNow Schema Export' + (inst ? ' — ' + inst : ''),
        '# Generated: ' + date,
        '',
        block('<https://servicenow.com/schema>', [
            ['a', 'owl:Ontology'], ['rdfs:label', ttlLit('ServiceNow Schema' + (inst ? ' — ' + inst : ''))],
            ['sn:exportedAt', ttlLit(date) + '^^xsd:dateTime'],
        ]),
    ];
    const nodes = (schema.nodes || []).filter(n => !n._diffOnly).sort((a, b) => a.id < b.id ? -1 : 1);
    for (const node of nodes) {
        const id  = ttlId(node.id);
        const adj = schema._adj.get(node.id);
        const eo  = (adj && adj.out) || [];
        const ei  = (adj && adj.in)  || [];
        const clsPairs = [
            ['a', node._isView ? 'owl:Class, sn:DbView' : 'owl:Class'],
            ['rdfs:label', ttlLit(node.label || node.id)],
            ['sn:technicalName', ttlLit(node.id)],
            ['sn:scope', ttlLit(node.scope || 'Global')],
        ];
        if (node.ws_access === false) clsPairs.push(['sn:wsAccessible', '"false"^^xsd:boolean']);
        if (etSet.has('extends')) {
            const pe = eo.find(e => e.type === 'extends');
            if (pe) clsPairs.push(['rdfs:subClassOf', 'snp:' + ttlId((pe.target && pe.target.id) || pe.target)]);
        }
        // DB view membership (added to class block)
        if (etSet.has('view')) {
            if (node._isView) {
                for (var vi = 0; vi < eo.length; vi++) { if (eo[vi].type === 'view') clsPairs.push(['sn:viewIncludes', 'snp:' + ttlId((eo[vi].target && eo[vi].target.id) || eo[vi].target)]); }
            } else {
                for (var vi = 0; vi < ei.length; vi++) { if (ei[vi].type === 'view') clsPairs.push(['sn:memberOfView', 'snp:' + ttlId((ei[vi].source && ei[vi].source.id) || ei[vi].source)]); }
            }
        }
        parts.push(block('snp:' + id, clsPairs));
        if (node.fields && node.fields.length) {
            for (const f of node.fields) {
                const isRef = f.type === 'reference';
                const propPairs = [
                    ['a', isRef ? 'owl:ObjectProperty' : 'owl:DatatypeProperty'],
                    ['rdfs:label', ttlLit(f.label || f.name)],
                    ['sn:technicalName', ttlLit(f.name)],
                    ['rdfs:domain', 'snp:' + id],
                ];
                if (isRef && etSet.has('reference')) {
                    const re = eo.find(e => e.type === 'reference' && e.field === f.name);
                    if (re) propPairs.push(['rdfs:range', 'snp:' + ttlId((re.target && re.target.id) || re.target)]);
                } else if (!isRef) { propPairs.push(['rdfs:range', snTypeToXsd(f.type)]); }
                parts.push(block('sn:' + ttlId(node.id + '_' + f.name), propPairs));
            }
        }
        if (etSet.has('m2m')) {
            const seen = new Set();
            for (const e of eo.concat(ei)) {
                if (e.type !== 'm2m') continue;
                const other = ((e.source && e.source.id) || e.source) === node.id ? ((e.target && e.target.id) || e.target) : ((e.source && e.source.id) || e.source);
                const key = node.id + '\0' + other;
                if (seen.has(key)) continue; seen.add(key);
                const mp = [['a', 'sn:M2MRelationship'], ['rdfs:domain', 'snp:' + id], ['rdfs:range', 'snp:' + ttlId(other)]];
                if (e.m2mTable) mp.push(['sn:junctionTable', ttlLit(e.m2mTable)]);
                parts.push(block('sn:m2m_' + ttlId(node.id) + '_' + ttlId(other), mp));
            }
        }

        // Named relationship associations
        if (etSet.has('rel')) {
            const seen = new Set();
            for (const e of eo.concat(ei)) {
                if (e.type !== 'rel') continue;
                const other = ((e.source && e.source.id) || e.source) === node.id ? ((e.target && e.target.id) || e.target) : ((e.source && e.source.id) || e.source);
                const key = other + '\0' + (e.name || '');
                if (seen.has(key)) continue; seen.add(key);
                const rp = [['a', 'sn:NamedRelationship'], ['rdfs:domain', 'snp:' + id], ['rdfs:range', 'snp:' + ttlId(other)]];
                if (e.name) rp.push(['sn:name', ttlLit(e.name)]);
                parts.push(block('sn:rel_' + ttlId(node.id) + '_' + ttlId(other) + (e.name ? '_' + ttlId(e.name) : ''), rp));
            }
        }

        // CMDB CI topology
        if (etSet.has('cmdb_rel')) {
            const seen = new Set();
            for (const e of eo.concat(ei)) {
                if (e.type !== 'cmdb_rel') continue;
                const other = ((e.source && e.source.id) || e.source) === node.id ? ((e.target && e.target.id) || e.target) : ((e.source && e.source.id) || e.source);
                const key = other + '\0' + (e.label || '');
                if (seen.has(key)) continue; seen.add(key);
                const cp = [['a', 'sn:CiRelationship'], ['rdfs:domain', 'snp:' + id], ['rdfs:range', 'snp:' + ttlId(other)]];
                if (e.label) cp.push(['sn:relationshipType', ttlLit(e.label)]);
                parts.push(block('sn:ciRel_' + ttlId(node.id) + '_' + ttlId(other) + (e.label ? '_' + ttlId(e.label) : ''), cp));
            }
        }
    }
    return parts.join('\n');
}

function serializeOpenApi(schema, opts) {
    const etSet   = new Set(opts.edgeTypes || ALL_EDGE_TYPES);
    const inst    = schema._instance && (schema._instance.instance_name || schema._instance.instance_url) || '';
    const instUrl = (schema._instance && schema._instance.instance_url) || '';
    const date    = new Date().toISOString();
    const nodeIds = new Set((schema.nodes || []).map(n => n.id));
    const yamlStr = s => {
        s = String(s == null ? '' : s);
        if (/^[a-zA-Z0-9_.-]+$/.test(s) && s.length > 0 && !['true','false','null','yes','no','on','off'].includes(s.toLowerCase())) return s;
        return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
    };
    const lines = [
        'openapi: 3.0.3', 'info:',
        '  title: '       + yamlStr('ServiceNow Schema' + (inst ? ' — ' + inst : '')),
        '  description: ' + yamlStr('Exported by SN Schema Export on ' + date),
        '  version: '     + yamlStr((schema._instance && schema._instance.build_name) || '1.0'),
    ];
    if (instUrl) {
        lines.push('servers:');
        lines.push('  - url: '         + yamlStr(instUrl));
        lines.push('    description: ' + yamlStr(inst || 'ServiceNow instance'));
    }
    // Table API CRUD paths — GET/POST collection endpoint, GET/PATCH/DELETE by sys_id
    // DB views are read-only (no POST/PATCH/DELETE).
    lines.push('paths:');
    const allNodes = (schema.nodes || []).filter(function(n) { return !n._diffOnly; }).sort(function(a, b) { return a.id < b.id ? -1 : 1; });
    for (const node of allNodes) {
        const opId = node.id.replace(/[^a-zA-Z0-9]/g, '_');
        const ref  = yamlStr('#/components/schemas/' + node.id);
        const lbl  = node.label || node.id;
        lines.push('  /api/now/table/' + node.id + ':');
        lines.push('    get:');
        lines.push('      summary: '     + yamlStr('Query ' + lbl));
        lines.push('      operationId: list_' + opId);
        lines.push('      tags: [' + yamlStr(node.id) + ']');
        lines.push('      parameters:');
        lines.push('        - {name: sysparm_query, in: query, schema: {type: string}}');
        lines.push('        - {name: sysparm_limit, in: query, schema: {type: integer, default: 10000}}');
        lines.push('        - {name: sysparm_offset, in: query, schema: {type: integer, default: 0}}');
        lines.push('        - {name: sysparm_fields, in: query, schema: {type: string}}');
        lines.push('        - {name: sysparm_display_value, in: query, schema: {type: string, enum: ["true","false","all"], default: "false"}}');
        lines.push('        - {name: sysparm_exclude_reference_link, in: query, schema: {type: boolean, default: false}}');
        lines.push('        - {name: sysparm_suppress_pagination_header, in: query, schema: {type: boolean, default: false}}');
        lines.push('        - {name: sysparm_view, in: query, schema: {type: string}}');
        lines.push('      responses:');
        lines.push('        "200":');
        lines.push('          description: OK');
        lines.push('          content:');
        lines.push('            application/json:');
        lines.push('              schema:');
        lines.push('                properties:');
        lines.push('                  result:');
        lines.push('                    type: array');
        lines.push('                    items: {$ref: ' + ref + '}');
        if (!node._isView) {
            lines.push('    post:');
            lines.push('      summary: '     + yamlStr('Create ' + lbl));
            lines.push('      operationId: create_' + opId);
            lines.push('      tags: [' + yamlStr(node.id) + ']');
            lines.push('      parameters:');
            lines.push('        - {name: sysparm_display_value, in: query, schema: {type: string, enum: ["true","false","all"], default: "false"}}');
            lines.push('        - {name: sysparm_input_display_value, in: query, schema: {type: boolean, default: false}}');
            lines.push('      requestBody:');
            lines.push('        content:');
            lines.push('          application/json:');
            lines.push('            schema: {$ref: ' + ref + '}');
            lines.push('      responses:');
            lines.push('        "201":');
            lines.push('          description: Created');
            lines.push('          content:');
            lines.push('            application/json:');
            lines.push('              schema:');
            lines.push('                properties:');
            lines.push('                  result: {$ref: ' + ref + '}');
        }
        lines.push('  /api/now/table/' + node.id + '/{sys_id}:');
        lines.push('    parameters:');
        lines.push('      - {name: sys_id, in: path, required: true, schema: {type: string}}');
        lines.push('    get:');
        lines.push('      summary: '     + yamlStr('Get ' + lbl));
        lines.push('      operationId: get_' + opId);
        lines.push('      tags: [' + yamlStr(node.id) + ']');
        lines.push('      parameters:');
        lines.push('        - {name: sysparm_display_value, in: query, schema: {type: string, enum: ["true","false","all"], default: "false"}}');
        lines.push('        - {name: sysparm_exclude_reference_link, in: query, schema: {type: boolean, default: false}}');
        lines.push('        - {name: sysparm_fields, in: query, schema: {type: string}}');
        lines.push('      responses:');
        lines.push('        "200":');
        lines.push('          description: OK');
        lines.push('          content:');
        lines.push('            application/json:');
        lines.push('              schema:');
        lines.push('                properties:');
        lines.push('                  result: {$ref: ' + ref + '}');
        if (!node._isView) {
            lines.push('    patch:');
            lines.push('      summary: '     + yamlStr('Update ' + lbl));
            lines.push('      operationId: patch_' + opId);
            lines.push('      tags: [' + yamlStr(node.id) + ']');
            lines.push('      parameters:');
            lines.push('        - {name: sysparm_display_value, in: query, schema: {type: string, enum: ["true","false","all"], default: "false"}}');
            lines.push('        - {name: sysparm_input_display_value, in: query, schema: {type: boolean, default: false}}');
            lines.push('      requestBody:');
            lines.push('        content:');
            lines.push('          application/json:');
            lines.push('            schema: {$ref: ' + ref + '}');
            lines.push('      responses:');
            lines.push('        "200":');
            lines.push('          description: OK');
            lines.push('          content:');
            lines.push('            application/json:');
            lines.push('              schema:');
            lines.push('                properties:');
            lines.push('                  result: {$ref: ' + ref + '}');
            lines.push('    delete:');
            lines.push('      summary: '     + yamlStr('Delete ' + lbl));
            lines.push('      operationId: delete_' + opId);
            lines.push('      tags: [' + yamlStr(node.id) + ']');
            lines.push('      responses:');
            lines.push('        "204": {description: "No Content"}');
        }
    }
    lines.push('components:', '  schemas:');
    const nodes = (schema.nodes || []).filter(n => !n._diffOnly).sort((a, b) => a.id < b.id ? -1 : 1);
    for (const node of nodes) {
        const adj = schema._adj.get(node.id);
        const eo  = (adj && adj.out) || [];
        const ei  = (adj && adj.in)  || [];
        const i4  = '    ';
        lines.push(i4 + yamlStr(node.id) + ':');
        lines.push(i4 + '  type: object');
        if (node.label && node.label !== node.id) lines.push(i4 + '  title: ' + yamlStr(node.label));
        if (node.scope)              lines.push(i4 + '  x-sn-scope: '         + yamlStr(node.scope));
        if (node._isView)            lines.push(i4 + '  x-sn-is-view: true');
        if (node.ws_access === false) lines.push(i4 + '  x-sn-ws-accessible: false');
        if (etSet.has('extends')) {
            const pe = eo.find(e => e.type === 'extends');
            if (pe) {
                const pid = (pe.target && pe.target.id) || pe.target;
                lines.push(i4 + '  x-sn-extends: ' + yamlStr(nodeIds.has(pid) ? '#/components/schemas/' + pid : pid));
            }
        }
        if (node.fields && node.fields.length) {
            lines.push(i4 + '  properties:');
            for (const f of node.fields) {
                lines.push(i4 + '    ' + yamlStr(f.name) + ':');
                const isRef = f.type === 'reference';
                if (isRef && etSet.has('reference')) {
                    const re = eo.find(e => e.type === 'reference' && e.field === f.name);
                    const tgt = re ? ((re.target && re.target.id) || re.target) : null;
                    if (tgt && nodeIds.has(tgt)) { lines.push(i4 + '      $ref: ' + yamlStr('#/components/schemas/' + tgt)); }
                    else { lines.push(i4 + '      type: string'); if (tgt) lines.push(i4 + '      x-sn-reference: ' + yamlStr(tgt)); }
                } else {
                    const oaType = NODE_TYPE_OA[f.type] || 'string';
                    const oaFmt  = NODE_TYPE_OA_FMT[f.type];
                    lines.push(i4 + '      type: ' + oaType);
                    if (oaFmt) lines.push(i4 + '      format: ' + oaFmt);
                }
                lines.push(i4 + '      x-sn-type: ' + yamlStr(f.type || 'string'));
                if (f.label && f.label !== f.name) lines.push(i4 + '      title: ' + yamlStr(f.label));
                if (f.mandatory) lines.push(i4 + '      x-sn-mandatory: true');
            }
        }
        if (etSet.has('m2m')) {
            const seen = new Set(); const m2ms = [];
            for (const e of eo.concat(ei)) {
                if (e.type !== 'm2m') continue;
                const other = ((e.source && e.source.id) || e.source) === node.id ? ((e.target && e.target.id) || e.target) : ((e.source && e.source.id) || e.source);
                if (seen.has(other)) continue; seen.add(other);
                m2ms.push({ table: other, junctionTable: e.m2mTable || null });
            }
            if (m2ms.length) {
                lines.push(i4 + '  x-sn-m2m:');
                for (const m of m2ms) {
                    lines.push(i4 + '    - table: ' + yamlStr(m.table));
                    if (m.junctionTable) lines.push(i4 + '      junctionTable: ' + yamlStr(m.junctionTable));
                }
            }
        }
        if (etSet.has('rel')) {
            const seen = new Set(); const rels = [];
            for (const e of eo.concat(ei)) {
                if (e.type !== 'rel') continue;
                const other = ((e.source && e.source.id) || e.source) === node.id ? ((e.target && e.target.id) || e.target) : ((e.source && e.source.id) || e.source);
                const key = other + '\0' + (e.name || '');
                if (seen.has(key)) continue; seen.add(key);
                rels.push({ table: other, name: e.name || '' });
            }
            if (rels.length) {
                lines.push(i4 + '  x-sn-relationships:');
                for (const r of rels) {
                    lines.push(i4 + '    - table: ' + yamlStr(r.table));
                    if (r.name) lines.push(i4 + '      name: ' + yamlStr(r.name));
                }
            }
        }

        // CMDB CI topology as YAML extension list
        if (etSet.has('cmdb_rel')) {
            const seen = new Set(); const ciRels = [];
            for (const e of eo.concat(ei)) {
                if (e.type !== 'cmdb_rel') continue;
                const other = ((e.source && e.source.id) || e.source) === node.id ? ((e.target && e.target.id) || e.target) : ((e.source && e.source.id) || e.source);
                const key = other + '\0' + (e.label || '');
                if (seen.has(key)) continue; seen.add(key);
                ciRels.push({ table: other, label: e.label || '' });
            }
            if (ciRels.length) {
                lines.push(i4 + '  x-sn-ci-topology:');
                for (const r of ciRels) {
                    lines.push(i4 + '    - table: ' + yamlStr(r.table));
                    if (r.label) lines.push(i4 + '      label: ' + yamlStr(r.label));
                }
            }
        }

        // DB view membership as YAML extension lists
        if (etSet.has('view')) {
            if (node._isView) {
                const members = eo.filter(function(e) { return e.type === 'view'; }).map(function(e) { return (e.target && e.target.id) || e.target; });
                if (members.length) {
                    lines.push(i4 + '  x-sn-view-includes:');
                    for (const m of members) lines.push(i4 + '    - ' + yamlStr(m));
                }
            } else {
                const views = ei.filter(function(e) { return e.type === 'view'; }).map(function(e) { return (e.source && e.source.id) || e.source; });
                if (views.length) {
                    lines.push(i4 + '  x-sn-member-of-view:');
                    for (const v of views) lines.push(i4 + '    - ' + yamlStr(v));
                }
            }
        }
    }
    return lines.join('\n') + '\n';
}

// ─── MAIN ─────────────────────────────────────────────────────────────────
(async function main() {
    const t0 = Date.now();
    log('Schema export — instance=' + config.instance);
    try {
        const input = await fetchAllViaTableApi();
        log('Building schema…');

        // Non-JSON formats and --pretty all need the full schema object in memory.
        // JSON streaming mode avoids materialising the full string (V8 ~512 MB cap).
        const needFullBuild = config.format !== 'json' || config.pretty;

        if (needFullBuild) {
            const schema = SchemaBuilder.build(input);
            // Attach adjacency map for serialisers that traverse edges
            schema._adj = buildAdj(schema);
            let content;
            if (config.format === 'json') {
                content = JSON.stringify(schema, null, 2);
            } else if (config.format === 'markdown') {
                log('Serialising as Markdown…');
                content = serializeMarkdown(schema, config);
            } else if (config.format === 'jsonld') {
                log('Serialising as JSON-LD…');
                content = serializeJsonLd(schema, config);
            } else if (config.format === 'owl') {
                log('Serialising as OWL/Turtle…');
                content = serializeTurtle(schema, config);
            } else if (config.format === 'openapi') {
                log('Serialising as OpenAPI YAML…');
                content = serializeOpenApi(schema, config);
            }
            log('Writing to ' + config.output + '…');
            fs.writeFileSync(config.output, content, 'utf8');
            const elapsed = (Date.now() - t0) / 1000;
            log('=== EXPORT COMPLETE ===');
            log('Output:  ' + path.resolve(config.output));
            log('Format:  ' + config.format);
            log('Counts:  ' + JSON.stringify(schema._stats.counts));
            log('Elapsed: ' + elapsed.toFixed(1) + 's');
            return;
        }

        // JSON streaming path (default — keeps memory usage low for large schemas)
        log('Streaming JSON to ' + config.output + '…');
        const out = fs.createWriteStream(config.output, { encoding: 'utf8' });
        let bytes = 0;
        const summary = SchemaBuilder.buildStreaming(input, (chunk) => {
            out.write(chunk);
            bytes += Buffer.byteLength(chunk, 'utf8');
        });
        await new Promise((resolve, reject) => {
            out.end((err) => err ? reject(err) : resolve());
        });
        const elapsed = (Date.now() - t0) / 1000;
        log('=== EXPORT COMPLETE ===');
        log('Output:  ' + path.resolve(config.output));
        log('Format:  json');
        log('Size:    ' + (bytes / 1048576).toFixed(2) + ' MB');
        log('Counts:  ' + JSON.stringify(summary.counts));
        log('Elapsed: ' + elapsed.toFixed(1) + 's');

        // Access-notes summary (mirrors BG-script behaviour). Skipped if there
        // were no count failures, since the section would otherwise be empty.
        if (input.recordCountFailures && Object.keys(input.recordCountFailures).length) {
            const buckets = { acl: [], unsupported: [], script_error: [], other: [] };
            for (const [name, info] of Object.entries(input.recordCountFailures)) {
                const cat = buckets[info.category] ? info.category : 'other';
                buckets[cat].push(name);
            }
            const total = buckets.acl.length + buckets.unsupported.length +
                          buckets.script_error.length + buckets.other.length;
            log('─────────────────────────────────────────────');
            log(`Access notes — ${total} tables could not be counted:`);
            const printBucket = (label, names, hint) => {
                if (!names.length) return;
                const preview = names.slice(0, 8).join(', ');
                const more = names.length > 8 ? ` … and ${names.length - 8} more` : '';
                log(`  ${label} (${names.length}):  ${preview}${more}`);
                if (hint) log(`    → ${hint}`);
            };
            printBucket('cross-scope ACL denials', buckets.acl,
                'Expected for scoped apps. Authenticate as a user with cross-scope read access to count these.');
            printBucket('aggregate not supported', buckets.unsupported,
                'Virtual tables that refuse COUNT queries; row count is unknowable via Stats API.');
            printBucket('script errors in vtable handlers', buckets.script_error,
                'Third-party vtable handlers threw exceptions during COUNT.');
            printBucket('other / unclassified', buckets.other,
                'See the instance system log around this timestamp for the underlying cause.');
            log('The full failure list is captured in _capabilities.recordCounts in the output JSON.');
        }
    } catch (err) {
        die(err.message || String(err), 2);
    }
})();
