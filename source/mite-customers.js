#!/usr/bin/env node
'use strict';

const program = require('commander');
const chalk = require('chalk');

const pkg = require('./../package.json');
const config = require('./config');
const miteApi = require('./lib/mite-api')(config.get());
const DataOutput = require('./lib/data-output');
const customersCommand = require('./lib/commands/customers');
const columnOptions = require('./lib/options/columns');

program
  .version(pkg.version)
  .description('list, filter & search for servuces')
  .option(
    '-a, --archived <true|false|all>',
    'When used will only show either archived customers or not archived ' +
    'customers',
    ((val) => {
      if (val === 'all') return 'all';
      return ['true', 'yes', 'ja', 'ok', '1'].indexOf(val.toLowerCase()) > -1;
    }),
    'all'
  )
  .option(
    '--columns <columns>',
    columnOptions.description(customersCommand.columns.options),
    columnOptions.parse,
    config.get().usersColumns,
  )
  .option(
    '-f, --format <format>',
    'defines the output format, valid options are ' + DataOutput.FORMATS.join(', '),
    config.get('outputFormat')
  )
  .option(
    '--search <query>',
    'optional search string which must be somewhere in the services’ name ' +
    '(case insensitive)'
  )
  .option(
    '--sort <column>',
    `optional column the results should be case-insensitive ordered by `+
    `(default: "${customersCommand.sort.default}"), ` +
    `valid values: ${customersCommand.sort.options.join(', ')}`,
    (value) => {
      if (customersCommand.sort.options.indexOf(value) === -1) {
        console.error(
          'Invalid value for sort option: "%s", valid values are: ',
          value,
          customersCommand.sort.options.join(', ')
        );
        process.exit(2);
      }
      return value;
    },
    customersCommand.sort.default // default sort
  )
  .on('--help', function() {
    console.log(`
Examples:

  Search for specific customers
    mite customers --search company1

  List customers ordered by their hourly rate
    mite customers --sort hourly_rate

  Export all archived customers
    mite customers --archived=true --format=csv > archived_customers.json

  Use different columns
    mite customers --columns=name,hourly_rate

  Use resulting customers to update their archived state
    mite customers --search company 1 --colums=id --format=text | xargs -n1 mite customer update --archived=false
`);
  })
  .parse(process.argv);

const opts = {
  name: program.search
};

miteApi.getCustomers(opts)
  .then((customers) => customers
    .filter(({ archived }) => program.archived === 'all' ? true : program.archived === archived)
  )
  .then(items => miteApi.sort(items, program.sort))
  .then(items => {
    const columns = columnOptions.resolve(program.columns, customersCommand.columns.options);

    // create final array of table data
    const tableData = items.map((item) => {
      let row = columns.map(columnDefinition => {
        const value = item[columnDefinition.attribute];
        if (typeof columnDefinition.format === 'function') {
          return columnDefinition.format(value, item);
        }
        return value;
      });
      if (item.archived) {
        row = row.map(v => chalk.grey(v));
      }
      return row;
    });

    // Table header
    tableData.unshift(
      columns
        .map(columnDefinition => columnDefinition.label)
        .map(v => chalk.bold(v))
    );

    console.log(DataOutput.formatData(tableData, program.format, columns));
  })
  .catch(err => {
    console.log(err && err.message || err);
    process.exit(1);
  });
