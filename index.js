import {ApolloServer}  from "@apollo/server";
import {startStandaloneServer} from "@apollo/server/standalone"
import {GraphQLError} from "graphql";

const api = "https://api-colombia.com/api/v1"

var departamentos = null;
var atracciones = null;
var regiones = null;

const getDepartamentos = async () => {
    if (departamentos == null) {
        const res = await fetch(`${api}/Department`);
        departamentos = await res.json();
    }
    return departamentos;
}

const getAtracciones = async () => {
    if (atracciones == null) {
        const res = await fetch(`${api}/TouristicAttraction`);
        atracciones = await res.json();
    }
    return atracciones;
}

const getRegiones = async () => {
    if (regiones == null) {
        const res = await fetch(`${api}/Region`);
        regiones = await res.json();
    }
    return regiones;
}

const normalizar = (texto) => {
    if (!texto) return "";
    return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

const densidad = (dep) => {
    if (!dep.surface) return 0;
    return Math.round(dep.population / dep.surface * 100) / 100;
}

const distanciaKm = (lat1, lon1, lat2, lon2) => {
    const rad = (g) => g * Math.PI / 180;
    const dLat = rad(lat2 - lat1);
    const dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const atraccionesDeDepartamento = async (idDepartamento) => {
    const lista = await getAtracciones();
    return lista.filter(a => a.city && a.city.departmentId === idDepartamento);
}

const typeDefs = `
    type Query {
        departamentos: [Departamento]
        departamentoPorId(id:Int!): Departamento
        departamentoPorNombre(nombre:String!): Departamento
        departamentosPoblacionMayor(poblacion:Int!): [Departamento]
        departamentosPoblacionMenor(poblacion:Int!): [Departamento]
        departamentosPoblacionEntre(minimo:Int!, maximo:Int!): [Departamento]
        departamentosMasPoblados(cantidad:Int = 5): [Departamento]
        departamentosMasExtensos(cantidad:Int = 5): [Departamento]
        departamentosPorDensidad(cantidad:Int = 5, mayorPrimero:Boolean = true): [Departamento]
        departamentosPorRegion(region:String!): [Departamento]
        departamentosSinAtracciones: [Departamento]
        regiones: [Region]
        estadisticas: Estadisticas

        atracciones: [Atraccion]
        atraccionesPorCiudad(ciudad:String!): [Atraccion]
        atraccionesPorDepartamento(departamento:String!): [Atraccion]
        buscarAtracciones(texto:String!): [Atraccion]
        atraccionesCercanas(latitud:Float!, longitud:Float!, radioKm:Float = 50): [Atraccion]
        ciudadesConAtracciones: [String]
    }

    type Departamento {
        id: Int
        nombre: String
        descripcion: String
        municipios: Int
        superficie: Float
        poblacion: Int
        densidad: Float
        prefijoTelefonico: String
        capital: Ciudad
        region: Region
        atracciones: [Atraccion]
    }

    type Ciudad {
        id: Int
        nombre: String
        descripcion: String
        superficie: Float
        poblacion: Int
        codigoPostal: String
        departamentoId: Int
    }

    type Atraccion {
        id: Int
        nombre: String
        descripcion: String
        latitud: Float
        longitud: Float
        ciudad: Ciudad
        departamento: Departamento
    }

    type Region {
        id: Int
        nombre: String
    }

    type Estadisticas {
        totalDepartamentos: Int
        totalAtracciones: Int
        poblacionTotal: Float
        superficieTotal: Float
        promedioPoblacion: Float
        masPoblado: Departamento
        menosPoblado: Departamento
        conMasAtracciones: Departamento
    }
`

const resolvers = {
    Query: {
        departamentos : async () => {
            const lista = await getDepartamentos();
            return [...lista].sort((a, b) => a.name.localeCompare(b.name));
        },
        departamentoPorId : async (parent, {id}, contextValue, info) => {
            const lista = await getDepartamentos();
            return lista.find(d => d.id === id);
        },
        departamentoPorNombre : async (parent, {nombre}, contextValue, info) => {
            const lista = await getDepartamentos();
            return lista.find(d => normalizar(d.name) === normalizar(nombre));
        },
        departamentosPoblacionMayor : async (parent, {poblacion}, contextValue, info) => {
            const lista = await getDepartamentos();
            return lista.filter(d => d.population > poblacion).sort((a, b) => b.population - a.population);
        },
        departamentosPoblacionMenor : async (parent, {poblacion}, contextValue, info) => {
            const lista = await getDepartamentos();
            return lista.filter(d => d.population < poblacion).sort((a, b) => a.population - b.population);
        },
        departamentosPoblacionEntre : async (parent, {minimo, maximo}, contextValue, info) => {
            if (minimo > maximo) {
                throw new GraphQLError("El minimo no puede ser mayor que el maximo", {
                    extensions: {code: "BAD_USER_INPUT"}
                });
            }
            const lista = await getDepartamentos();
            return lista.filter(d => d.population >= minimo && d.population <= maximo)
                .sort((a, b) => a.population - b.population);
        },
        departamentosMasPoblados : async (parent, {cantidad}, contextValue, info) => {
            const lista = await getDepartamentos();
            return [...lista].sort((a, b) => b.population - a.population).slice(0, cantidad);
        },
        departamentosMasExtensos : async (parent, {cantidad}, contextValue, info) => {
            const lista = await getDepartamentos();
            return [...lista].sort((a, b) => b.surface - a.surface).slice(0, cantidad);
        },
        departamentosPorDensidad : async (parent, {cantidad, mayorPrimero}, contextValue, info) => {
            const lista = await getDepartamentos();
            const ordenada = [...lista].sort((a, b) => densidad(a) - densidad(b));
            if (mayorPrimero) ordenada.reverse();
            return ordenada.slice(0, cantidad);
        },
        departamentosPorRegion : async (parent, {region}, contextValue, info) => {
            const listaRegiones = await getRegiones();
            const encontrada = listaRegiones.find(r => normalizar(r.name) === normalizar(region));
            if (!encontrada) return [];
            const lista = await getDepartamentos();
            return lista.filter(d => d.regionId === encontrada.id).sort((a, b) => a.name.localeCompare(b.name));
        },
        departamentosSinAtracciones : async () => {
            const lista = await getDepartamentos();
            const listaAtracciones = await getAtracciones();
            const conAtracciones = new Set(listaAtracciones.filter(a => a.city).map(a => a.city.departmentId));
            return lista.filter(d => !conAtracciones.has(d.id)).sort((a, b) => a.name.localeCompare(b.name));
        },
        regiones : async () => await getRegiones(),
        estadisticas : async () => {
            const lista = await getDepartamentos();
            const listaAtracciones = await getAtracciones();

            const poblacionTotal = lista.reduce((suma, d) => suma + d.population, 0);
            const superficieTotal = lista.reduce((suma, d) => suma + d.surface, 0);
            const ordenada = [...lista].sort((a, b) => b.population - a.population);

            var conteo = {};
            listaAtracciones.filter(a => a.city).forEach(a => {
                conteo[a.city.departmentId] = (conteo[a.city.departmentId] || 0) + 1;
            });
            const idMayor = Object.keys(conteo).sort((a, b) => conteo[b] - conteo[a])[0];

            return {
                totalDepartamentos: lista.length,
                totalAtracciones: listaAtracciones.length,
                poblacionTotal,
                superficieTotal,
                promedioPoblacion: lista.length ? poblacionTotal / lista.length : 0,
                masPoblado: ordenada[0],
                menosPoblado: ordenada[ordenada.length - 1],
                conMasAtracciones: lista.find(d => d.id === Number(idMayor))
            };
        },

        atracciones : async () => {
            const lista = await getAtracciones();
            return [...lista].sort((a, b) => a.name.localeCompare(b.name));
        },
        atraccionesPorCiudad : async (parent, {ciudad}, contextValue, info) => {
            const lista = await getAtracciones();
            return lista.filter(a => a.city && normalizar(a.city.name) === normalizar(ciudad));
        },
        atraccionesPorDepartamento : async (parent, {departamento}, contextValue, info) => {
            const lista = await getDepartamentos();
            const dep = lista.find(d => normalizar(d.name) === normalizar(departamento));
            if (!dep) return [];
            return await atraccionesDeDepartamento(dep.id);
        },
        buscarAtracciones : async (parent, {texto}, contextValue, info) => {
            const lista = await getAtracciones();
            const buscado = normalizar(texto);
            return lista.filter(a => normalizar(a.name).includes(buscado) || normalizar(a.description).includes(buscado));
        },
        atraccionesCercanas : async (parent, {latitud, longitud, radioKm}, contextValue, info) => {
            const lista = await getAtracciones();
            return lista
                .map(a => ({...a, distancia: distanciaKm(latitud, longitud, Number(a.latitude), Number(a.longitude))}))
                .filter(a => a.distancia <= radioKm)
                .sort((a, b) => a.distancia - b.distancia);
        },
        ciudadesConAtracciones : async () => {
            const lista = await getAtracciones();
            const nombres = lista.filter(a => a.city).map(a => a.city.name);
            return [...new Set(nombres)].sort();
        },
    },
    Departamento: {
        nombre : (parent) => parent.name,
        descripcion : (parent) => parent.description,
        municipios : (parent) => parent.municipalities,
        superficie : (parent) => parent.surface,
        poblacion : (parent) => parent.population,
        densidad : (parent) => densidad(parent),
        prefijoTelefonico : (parent) => parent.phonePrefix,
        capital : (parent) => parent.cityCapital,
        region : async (parent) => {
            const lista = await getRegiones();
            return lista.find(r => r.id === parent.regionId);
        },
        atracciones : async (parent) => await atraccionesDeDepartamento(parent.id),
    },
    Ciudad: {
        nombre : (parent) => parent.name,
        descripcion : (parent) => parent.description,
        superficie : (parent) => parent.surface,
        poblacion : (parent) => parent.population,
        codigoPostal : (parent) => parent.postalCode,
        departamentoId : (parent) => parent.departmentId,
    },
    Atraccion: {
        nombre : (parent) => parent.name,
        descripcion : (parent) => parent.description,
        latitud : (parent) => Number(parent.latitude),
        longitud : (parent) => Number(parent.longitude),
        ciudad : (parent) => parent.city,
        departamento : async (parent) => {
            if (!parent.city) return null;
            const lista = await getDepartamentos();
            return lista.find(d => d.id === parent.city.departmentId);
        },
    },
    Region: {
        nombre : (parent) => parent.name,
    }
}

const server = new ApolloServer({
    typeDefs,
    resolvers
})

const {url} = await startStandaloneServer(server,{listen:{port:4000}})
console.log(`Server ready at ${url}`)

