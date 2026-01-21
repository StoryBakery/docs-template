--[=[
	@class Sample

	Sample module for luau-docgen tests.
]=]
local Sample = {}
Sample.__index = Sample

--[=[
	Creates a new Sample.

	@param name string -- Identifier.
	@param enabled boolean -- Whether the instance is enabled.
	  Additional details for the enabled flag.
	@return Sample -- New instance.
]=]
function Sample.new(name: string, enabled: boolean): Sample
	return setmetatable({ name = name, enabled = enabled }, Sample)
end

--[=[
	@prop Enabled boolean
	@within Sample
	@readonly

	Whether the instance is enabled.
]=]
Sample.Enabled = true

return Sample
