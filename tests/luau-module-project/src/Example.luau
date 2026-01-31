--[=[
	@class Example
	
	Example class used for reference tests.
]=]
local Example = {}
Example.__index = Example
Example.version = "0.1.0"

--[=[
	@prop Changed Signal
	@within Example
	
	Fires when the instance changes.
	예시예시!! 
]=]
Example.Changed = nil

--[=[
	@constructor
	
	Creates a new Example instance.

	@param name string
	@return Example
]=]
function Example.new(name: string): Example
	return setmetatable({ name = name, enabled = false }, Example)
end

--[=[
	Enables the instance.

	@param flag boolean
]=]
function Example:enable(flag: boolean)
	self.enabled = flag ~= false
end

return Example
