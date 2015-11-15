'use strict'

var sa = require('superagent')
var fs = require('fs')
var debug = require('debug')('open-refine')

// ES6 Promise plugin for superagent
function promise () {
  return function (req) {
    req.end = function () {
      return new Promise(function (resolve, reject) {
        Object.getPrototypeOf(req).end.call(req, function (err, res) {
          if (err) { return reject(err) }
          if (!res.ok) { return reject(res.text) }
          resolve(res)
        })
      })
    }
  }
}

module.exports = function (endpoint) {
  var conf = {
    endpoint: endpoint || 'http://localhost:3333'
  }
  var server = {}

  server.project = function (project_name) {
    debug('create project ' + project_name)
    server._project_name = project_name
    return Object.assign(new Promise(resolve => resolve()), server)
  }

  server.projects_metadata = function () {
    debug('get projects metadata')
    return sa.get(conf.endpoint + '/command/core/get-all-project-metadata')
      .use(promise())
      .end()
      .then(res => res.body)
  }

  server.id = function () {
    if (arguments.length > 0) {
      debug('set project id to ' + arguments[0])
      server._project_id = arguments[0]
      return Object.assign(new Promise(resolve => resolve()), server)
    } else {
      return server._project_id
    }
  }

  server.upload = function (file_name) {
    debug('upload data in ' + file_name)
    return Object.assign(
      sa.post(conf.endpoint + '/command/core/create-project-from-upload?options={"encoding":"UTF-8","separator":",","ignoreLines":-1,"headerLines":1,"skipDataLines":0,"limit":-1,"storeBlankRows":true,"guessCellValueTypes":false,"processQuotes":true,"storeBlankCellsAsNulls":true,"includeFileSources":false}')
        .use(promise())
        .redirects(0)
        .field('project-name', server._project_name)
        .attach('project-file', fs.readFileSync(file_name), file_name)
        .end()
        .catch(err => {
          if (err.status === 302) {
            return err.response
          }
          return err
        })
        .then(res => {
          server._project_id = +res.headers.location.replace(conf.endpoint + '/project?project=', '')
          return {
            project_id: server._project_id
          }
        }),
      server)
  }

  server.apply = function (op_file_name) {
    return Object.assign(
      this.then(() => {
        debug('apply operations in ' + op_file_name + ' to project ' + server._project_id + '.')
        return sa.post(conf.endpoint + '/command/core/apply-operations?project=' + server._project_id)
          .use(promise())
          .send('operations=' + fs.readFileSync(op_file_name))
          .end()
      }),
      server)
  }

  server.download = function (format, output_file_name) {
    return Object.assign(
      this.then(() => {
        debug('download data in project ' + server._project_id + ' to ' + output_file_name + '.')
        return sa.post(conf.endpoint + '/command/core/export-rows/' + server._project_id + '.' + format)
          .use(promise())
          .send('engine={"facets":[],"mode":"row-based"}')
          .send('project=' + server._project_id)
          .send('format=' + format)
          .end()
          .then(res => fs.writeFileSync(output_file_name, res.text))
      }),
      server)
  }

  server.delete = function (id) {
    debug('delete project ' + id)
    return sa.post(conf.endpoint + '/command/core/delete-project')
      .use(promise())
      .send('project=' + id)
      .end()
  }

  return server
}