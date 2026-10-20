-- Oracle read-only metadata queries. Prepared from pasted SQL; NOT executed.
-- Run under the same connection/current schema used for the original queries.
-- ALL_* views show accessible objects only. No rows does not prove absence.
-- If a source is a synonym/view, resolve it before reading base-table metadata.

-- 1. Direct source object types.
SELECT owner, object_name, object_type, status
FROM all_objects
WHERE (owner = 'SPKPRDDTA' AND object_name = 'F5530Z20')
   OR (owner = 'CGPRDDTA' AND object_name = 'F0006')
ORDER BY owner, object_name, object_type;

-- 2. Synonym targets, including possible GET_DATE name resolution candidates.
-- GET_DATE candidates are NOT proof of the function actually resolved.
SELECT owner, synonym_name, table_owner, table_name, db_link
FROM all_synonyms
WHERE (owner = 'SPKPRDDTA' AND synonym_name = 'F5530Z20')
   OR (owner = 'CGPRDDTA' AND synonym_name = 'F0006')
   OR (synonym_name = 'GET_DATE'
       AND owner IN (SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA'), 'PUBLIC'))
ORDER BY owner, synonym_name;

-- 3. Actual columns: data length is bytes; char_length is characters.
-- Numeric precision/scale are declarations, separate from business /100 scaling.
-- DATA_DEFAULT is a LONG field; client display/export may need configuration.
SELECT c.owner, c.table_name, c.column_id, c.column_name,
       c.data_type, c.data_type_owner, c.data_length,
       c.char_length, c.char_used,
       c.data_precision, c.data_scale, c.nullable,
       c.data_default, m.comments
FROM all_tab_columns c
LEFT JOIN all_col_comments m
  ON m.owner = c.owner
 AND m.table_name = c.table_name
 AND m.column_name = c.column_name
WHERE (c.owner = 'SPKPRDDTA' AND c.table_name = 'F5530Z20')
   OR (c.owner = 'CGPRDDTA' AND c.table_name = 'F0006')
ORDER BY c.owner, c.table_name, c.column_id;

-- 4. Declared constraints: P=primary, U=unique, R=foreign, C=check.
-- Uniqueness may also be implemented by indexes or application logic.
SELECT k.owner, k.table_name, k.constraint_name, k.constraint_type,
       k.status, k.validated, c.position, c.column_name,
       k.r_owner, k.r_constraint_name, k.delete_rule
FROM all_constraints k
LEFT JOIN all_cons_columns c
  ON c.owner = k.owner
 AND c.constraint_name = k.constraint_name
 AND c.table_name = k.table_name
WHERE (k.owner = 'SPKPRDDTA' AND k.table_name = 'F5530Z20')
   OR (k.owner = 'CGPRDDTA' AND k.table_name = 'F0006')
ORDER BY k.owner, k.table_name, k.constraint_name, c.position;

-- 5. Direct object dependencies. Not a complete ETL lineage reconstruction.
SELECT owner, name, type, referenced_owner, referenced_name,
       referenced_type, referenced_link_name, dependency_type
FROM all_dependencies
WHERE (owner = 'SPKPRDDTA' AND name = 'F5530Z20')
   OR (owner = 'CGPRDDTA' AND name = 'F0006')
ORDER BY owner, name, referenced_owner, referenced_name;

-- 6. Accessible standalone GET_DATE signatures.
-- Position 0 identifies the return value. Check owner and name resolution.
SELECT owner, object_name, package_name, overload, subprogram_id,
       argument_name, position, sequence, data_level, in_out,
       data_type, data_length, data_precision, data_scale,
       type_owner, type_name
FROM all_arguments
WHERE object_name = 'GET_DATE'
  AND package_name IS NULL
ORDER BY owner, subprogram_id, sequence;
